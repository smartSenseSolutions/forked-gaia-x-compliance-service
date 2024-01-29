import { ConflictException, Injectable, Logger } from '@nestjs/common'
import Parser from '@rdfjs/parser-n3'
import jsonld from 'jsonld'
import rdf from 'rdf-ext'
import DatasetExt from 'rdf-ext/lib/Dataset'
import SHACLValidator from 'rdf-validate-shacl'
import { Readable } from 'stream'
import { Schema_caching, ValidationResult } from '../dto'
import { RegistryService } from './registry.service'

const cache: Schema_caching = {
  trustframework: {}
}

@Injectable()
export class ShaclService {
  constructor(private readonly registryService: RegistryService) {}

  private readonly logger = new Logger(ShaclService.name)

  async validate(shapes: DatasetExt, data: DatasetExt): Promise<ValidationResult> {
    const validator = new SHACLValidator(shapes, { factory: rdf as any })
    const report = await validator.validate(data)
    const { conforms, results: reportResults } = report

    const results: string[] = []
    for (const result of reportResults) {
      let errorMessage = `ERROR: ${result?.focusNode?.value} ${result.path}: ${result.message || 'does not conform with the given shape'}`

      if (result.detail && result.detail.length > 0) {
        errorMessage = `${errorMessage}; DETAILS:`
        for (const detail of result.detail) {
          errorMessage = `${errorMessage} ${detail.path}: ${detail.message || 'does not conform with the given shape'};`
        }
      }
      results.push(errorMessage)
    }

    return {
      conforms,
      results
    }
  }

  async loadFromTurtle(raw: string): Promise<DatasetExt> {
    try {
      const parser = new Parser({ factory: rdf as any })
      return this.transformToStream(raw, parser)
    } catch (error) {
      throw new ConflictException('Cannot load from provided turtle.')
    }
  }

  async loadShaclFromUrl(type: string): Promise<DatasetExt> {
    try {
      const response = await this.registryService.getShape(type)
      return this.isJsonString(response) ? this.loadFromJSONLDWithQuads(response) : this.loadFromTurtle(response)
    } catch (error) {
      this.logger.error(`${error}, Url used to fetch shapes: ${process.env.REGISTRY_URL}/api/trusted-shape-registry/v1/shapes/${type}`)
      throw new ConflictException(error)
    }
  }

  private async transformToStream(raw: string, parser: any): Promise<DatasetExt> {
    const stream = new Readable()
    stream.push(raw)
    stream.push(null)

    return await rdf.dataset().import(parser.import(stream))
  }

  private isJsonString(str: any): boolean {
    try {
      JSON.parse(str)
    } catch (e) {
      return false
    }

    return true
  }

  public async getShaclShape(shapeName: string): Promise<DatasetExt> {
    return await this.loadShaclFromUrl(shapeName)
  }

  public async verifyShape(verifiablePresentation: any, type: string): Promise<ValidationResult> {
    const quads = await this.normalize(verifiablePresentation)
    if (!(await this.shouldCredentialBeValidated(quads))) {
      throw new ConflictException('VerifiableCrdential contains a shape that is not defined in registry shapes')
    }
    try {
      const selfDescriptionDataset: DatasetExt = await this.loadFromJSONLDWithQuads(verifiablePresentation)
      if (this.isCached(type)) {
        return await this.validate(cache[type].shape, selfDescriptionDataset)
      } else {
        const schema = await this.getShaclShape(type)
        cache[type].shape = schema
        return await this.validate(schema, selfDescriptionDataset)
      }
    } catch (e) {
      this.logger.error(e)
      return {
        conforms: false,
        results: [e.message]
      }
    }
  }

  private isCached(type: string): boolean {
    let cached = false
    if (cache[type] && cache[type].shape) {
      cached = true
    }
    return cached
  }

  async loadFromJSONLDWithQuads(data: object) {
    const quads = await this.normalize(data)
    const stream = new Readable()
    stream.push(quads)
    stream.push(null)
    const parser = new Parser({ factory: rdf as any })
    if (!quads || quads.length === 0) {
      throw new ConflictException('Unable to canonize your VerifiablePresentation')
    }
    return await rdf.dataset().import(parser.import(stream))
  }

  private async shouldCredentialBeValidated(quads: string) {
    let validTypes = await this.registryService.getImplementedTrustFrameworkShapes()
    validTypes = validTypes.map(
      validType => 'https://registry.lab.gaia-x.eu/development/api/trusted-shape-registry/v1/shapes/jsonld/trustframework#' + validType
    )
    const credentialTypes = this.getVPTypes(quads)
    return (
      credentialTypes.length > 0 &&
      credentialTypes
        .map(type => validTypes.indexOf(type) > -1)
        .reduce((previousValue, currentValue) => {
          return previousValue && currentValue
        })
    )
  }

  private getVPTypes(canonizedVP: string): string[] {
    return canonizedVP
      .split('\n')
      .filter(quad => quad.indexOf('http://www.w3.org/1999/02/22-rdf-syntax-ns#type') > -1)
      .filter(typeQuad => typeQuad.indexOf('<https://w3id.org/security#JsonWebSignature2020>') == -1) // remove proof
      .filter(typeQuad => typeQuad.indexOf('<https://www.w3.org/2018/credentials#VerifiablePresentation>') == -1) // remove vp
      .filter(typeQuad => typeQuad.indexOf('<https://www.w3.org/2018/credentials#VerifiableCredential>') == -1) //remove vc
      .map(typeQuad => {
        return typeQuad.split(' ')[2].replace(/<*>*/g, '')
      })
  }

  private normalize(objectToCanonize: any): Promise<string> {
    return jsonld.canonize(objectToCanonize, { format: 'application/n-quads' })
  }
}
