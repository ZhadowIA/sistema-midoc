// Punto de entrada de la infraestructura (alcance: suscripción).
// Crea el grupo de recursos del entorno y delega los recursos a resources.bicep.
// Convención azd: el nombre del entorno y la ubicación vienen del entorno azd.
targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Nombre del entorno azd; prefija el nombre de los recursos.')
param environmentName string

@minLength(1)
@description('Región de Azure para todos los recursos (decisión del piloto: Mexico Central).')
param location string

// --- Configuración no secreta de la app (con valores por defecto del proyecto) ---
param termsVersion string = '2026-05'
param privacyVersion string = '2026-05'
param smsProvider string = 'mock'
param smsBaseUrl string = 'https://sms.example.com'
param emailProvider string = 'mock'
param emailBaseUrl string = 'https://email.example.com'
param emailFrom string = 'no-responder@midoc.example.com'
@allowed(['MOCK', 'STRIPE', 'CONEKTA', 'OPENPAY'])
param paymentsProvider string = 'MOCK'
param postgresAdminLogin string = 'midocadmin'

// --- Secretos (los provee el operador vía azd; nunca hardcodeados) ---
@secure()
param nextAuthSecret string
@secure()
param questionnaireTokenSecret string
@secure()
param twoFactorEncryptionKey string
@secure()
param notificationCronSecret string
@secure()
param paymentsWebhookSecret string
@secure()
param smsApiKey string
@secure()
param emailApiKey string
@secure()
param postgresAdminPassword string

// Imagen del contenedor; azd la inyecta tras construir y publicar en ACR.
param portalImageName string = ''

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  scope: rg
  name: 'resources'
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    portalImageName: portalImageName
    termsVersion: termsVersion
    privacyVersion: privacyVersion
    smsProvider: smsProvider
    smsBaseUrl: smsBaseUrl
    emailProvider: emailProvider
    emailBaseUrl: emailBaseUrl
    emailFrom: emailFrom
    paymentsProvider: paymentsProvider
    postgresAdminLogin: postgresAdminLogin
    nextAuthSecret: nextAuthSecret
    questionnaireTokenSecret: questionnaireTokenSecret
    twoFactorEncryptionKey: twoFactorEncryptionKey
    notificationCronSecret: notificationCronSecret
    paymentsWebhookSecret: paymentsWebhookSecret
    smsApiKey: smsApiKey
    emailApiKey: emailApiKey
    postgresAdminPassword: postgresAdminPassword
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.containerRegistryLoginServer
output SERVICE_PORTAL_NAME string = resources.outputs.portalAppName
output SERVICE_PORTAL_URI string = resources.outputs.portalAppUri
output AZURE_KEY_VAULT_NAME string = resources.outputs.keyVaultName
