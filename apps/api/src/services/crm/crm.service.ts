import { PrismaClient, CrmType } from '@prisma/client'
import { ICRMProvider } from './crm.interface'
import { GHLProvider } from './providers/ghl.provider'
import { HubSpotProvider } from './providers/hubspot.provider'
import { SalesforceProvider } from './providers/salesforce.provider'
import { ZohoProvider } from './providers/zoho.provider'
import { decryptJSON } from '../../utils/encrypt'
import { logger } from '../../utils/logger'

const prisma = new PrismaClient()

export class CRMService {
  async forClient(clientId: string): Promise<ICRMProvider> {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { crmType: true, ghlLocationId: true }
    })

    if (!client) throw new Error(`Client not found: ${clientId}`)

    const crmType = client.crmType

    if (crmType === CrmType.GHL) {
      return new GHLProvider({
        locationId: client.ghlLocationId || '',
        apiKey: process.env['GHL_API_KEY']
      })
    }

    const credRecord = await prisma.clientCredential.findFirst({
      where: { clientId, service: crmType.toLowerCase() }
    })

    if (!credRecord) {
      throw new Error(`No ${crmType} credentials found for client ${clientId}`)
    }

    const creds = decryptJSON<Record<string, string>>(credRecord.credentials)

    switch (crmType) {
      case CrmType.HUBSPOT:
        return new HubSpotProvider({
          accessToken: creds.accessToken,
          portalId: creds.portalId
        })

      case CrmType.SALESFORCE:
        return new SalesforceProvider({
          accessToken: creds.accessToken,
          instanceUrl: creds.instanceUrl,
          refreshToken: creds.refreshToken
        })

      case CrmType.ZOHO:
        return new ZohoProvider({
          accessToken: creds.accessToken,
          orgId: creds.orgId,
          region: creds.region
        })

      default:
        throw new Error(`Unsupported CRM type: ${crmType}`)
    }
  }
}

export const crmService = new CRMService()
