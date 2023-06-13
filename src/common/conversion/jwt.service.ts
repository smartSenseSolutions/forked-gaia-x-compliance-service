import { Injectable } from '@nestjs/common'
import { Converter } from './conversion.model'
import * as jose from 'jose'
import crypto from 'crypto'
import { getDidWeb } from '../utils'

@Injectable()
export class JWTConversionService implements Converter<string> {
  accept(type: string): boolean {
    return type === 'application/vc+jwt' || type === 'application/jwt'
  }

  async convert<S extends jose.JWTPayload>(value: S, type: string) {
    const alg = 'RS256'

    const privateKey = process.env.privateKey.startsWith('-----BEGIN RSA PRIVATE KEY-----')
      ? crypto.createPrivateKey(process.env.privateKey)
      : await jose.importPKCS8(process.env.privateKey, alg)

    const issuer = (value.issuer as string) || getDidWeb()
    const issuance = (value.issuanceDate && new Date(value.issuanceDate as string)) || new Date()
    const exp = (value.expirationDate && new Date(value.expirationDate as string)) || new Date(issuance.getTime() + 60 * 60 * 1000)

    const sign = new jose.SignJWT(value)
      .setProtectedHeader({ alg, typ: 'JWT' })
      .setIssuedAt(Math.trunc(issuance.getTime() / 1000))
      .setExpirationTime(Math.trunc(exp.getTime() / 1000))
      .setIssuer(issuer)
      /**
       * https://datatracker.ietf.org/doc/html/rfc7519#section-4.1.3
       * Audience claim is mandatory, but not its usage. Should identify the recipients.
       */
      .setAudience(issuer)

    const jwt = await sign.sign(privateKey)

    return { type, value: jwt }
  }
}
