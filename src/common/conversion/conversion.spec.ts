import { CommonModule } from '../common.module'
import { ConversionService } from './conversion.service'
import { Test, TestingModule } from '@nestjs/testing'
import * as jose from 'jose'

const payload = {
  id: 'did:example:123456789abcdefghi#key-1',
  name: 'John Doe',
  issuanceDate: '2020-01-01T00:00:00.000Z',
  expirationDate: '2099-01-01T00:00:00.000Z'
}

const expectedJwt =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJpZCI6ImRpZDpleGFtcGxlOjEyMzQ1Njc4OWFiY2RlZmdoaSNrZXktMSIsIm5hbWUiOiJKb2huIERvZSIsImlzc3VhbmNlRGF0ZSI6IjIwMjAtMDEtMDFUMDA6MDA6MDAuMDAwWiIsImV4cGlyYXRpb25EYXRlIjoiMjA5OS0wMS0wMVQwMDowMDowMC4wMDBaIn0sImlhdCI6MTU3NzgzNjgwMCwiZXhwIjo0MDcwOTA4ODAwLCJpc3MiOiJkaWQ6d2ViOmxvY2FsaG9zdCUzQTMwMDAiLCJzdWIiOiJkaWQ6ZXhhbXBsZToxMjM0NTY3ODlhYmNkZWZnaGkja2V5LTEiLCJhdWQiOiJkaWQ6ZXhhbXBsZToxMjM0NTY3ODlhYmNkZWZnaGkja2V5LTEifQ.utLv2Re03QHbzwRpF3uAtRasG8xPTd3CQGR_eth9gWIw03B-bpuHRaIa9NH91QxQgYVwPnNgVCVQPnW9WJjWjZ4xLNsCBOL0FtWF4lMfucm4FVpHp7u4C3LmYPKkV10-C4KW1X2a3ihrLuaCgi1GjFyca0jjLMxy7CnKeOsopzZW7gVNIacRw_2lG-boMKnNQA4iKBFuuj888HMFG4omH60LTjNaFsnGiHcyMxLvJcT6qSSqCBjQWEZ6r9Yhcy39hKuQY_L7ZGFZTouUOIYCtPrVvM9QWq0FFLLuj6CGiiI4NkzpDbq01_700rQ2BJT8q83GabbloZ57r4rvLZvf7Q'

describe('ConversionService', () => {
  let conversionService: ConversionService

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [CommonModule]
    }).compile()
    conversionService = moduleFixture.get<ConversionService>(ConversionService)
  })

  it('should be defined', () => {
    expect(conversionService).toBeDefined()
  })
  it('convert object to JSON', async () => {
    const result = await conversionService.convert('application/json', payload, {})
    expect(result.type).toBe('application/json')
    expect(result.value).toBe(JSON.stringify(payload, null, 2))
  })
  it('convert object to JWT', async () => {
    const result = await conversionService.convert('application/vc+jwt', payload, {})
    expect(result.type).toBe('application/vc+jwt')
    expect(result.value).toBe(expectedJwt)
  })
  it('JWT must be valid', async () => {
    const result = await jose.jwtVerify(expectedJwt, await jose.importSPKI(process.env.publicKey, 'ES256'))
    expect(result.payload).toBeDefined()
    expect(result.payload.sub).toBe(payload.id)
    expect(result.payload.aud).toBe(payload.id)
    expect(result.payload.iat).toBe(1577836800)
    expect(result.payload.exp).toBe(4070908800)
    expect(result.payload.iss).toBe('did:web:localhost%3A3000')
  })
})
