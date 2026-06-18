// Recursos del portal MiDoc (alcance: grupo de recursos).
// Container Apps + ACR + PostgreSQL Flexible + Key Vault + Managed Identity +
// observabilidad + jobs (migraciones y cron). Secretos en Key Vault; identidad
// administrada para pull de ACR y lectura de secretos (sin credenciales en código).

@description('Región de Azure.')
param location string
param tags object
@description('Sufijo determinista para nombres únicos.')
param resourceToken string
@description('Imagen del contenedor (la inyecta azd tras publicar en ACR).')
param portalImageName string

// Config no secreta de la app.
param termsVersion string
param privacyVersion string
param smsProvider string
param smsBaseUrl string
param whatsappProvider string
param phoneNotificationChannel string
param twilioAccountSid string
param twilioMessagingServiceSid string
param twilioFromPhoneNumber string
param twilioWhatsAppMessagingServiceSid string
param twilioWhatsAppFromPhoneNumber string
param emailProvider string
param emailBaseUrl string
param emailFrom string
param paymentsProvider string
param postgresAdminLogin string

// Secretos.
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
param twilioAuthToken string
@secure()
param emailApiKey string
@secure()
param postgresAdminPassword string

// Roles integrados.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

var portalAppName = 'ca-portal-${resourceToken}'
var databaseName = 'midoc'
var placeholderImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

// ---------- Observabilidad ----------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${resourceToken}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ---------- Identidad administrada ----------
resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${resourceToken}'
  location: location
  tags: tags
}

// ---------- Container Registry ----------
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acr${resourceToken}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    // Sin usuario admin; el acceso es vía Managed Identity (best practice Azure).
    // El SKU Basic no permite pull anónimo (deshabilitado por defecto).
    adminUserEnabled: false
  }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, uami.id, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------- Key Vault ----------
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    // No deshabilitar purge protection (best practice Azure).
    enablePurgeProtection: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, uami.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------- PostgreSQL Flexible Server ----------
// Solo datos mínimos del portal (identidad, agenda, suscripción, buzón temporal).
// REGLA DE ORO: ningún dato clínico se persiste aquí.
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'psql-${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms' // Burstable: suficiente para el piloto; escalar después.
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    authConfig: {
      passwordAuth: 'Enabled'
      activeDirectoryAuth: 'Disabled'
    }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Permite el acceso desde servicios de Azure (ACA). TODO endurecer con VNet/
// private endpoint antes de producción comercial.
resource postgresAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

var databaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'

// ---------- Secretos en Key Vault ----------
resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'database-url'
  properties: { value: databaseUrl }
}
resource secretNextAuth 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'nextauth-secret'
  properties: { value: nextAuthSecret }
}
resource secretQuestionnaire 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'questionnaire-token-secret'
  properties: { value: questionnaireTokenSecret }
}
resource secretTwoFactor 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'two-factor-encryption-key'
  properties: { value: twoFactorEncryptionKey }
}
resource secretCron 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'notification-cron-secret'
  properties: { value: notificationCronSecret }
}
resource secretPayments 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'payments-webhook-secret'
  properties: { value: paymentsWebhookSecret }
}
resource secretSms 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'sms-api-key'
  properties: { value: smsApiKey }
}
resource secretTwilioAuthToken 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(twilioAuthToken)) {
  parent: keyVault
  name: 'twilio-auth-token'
  properties: { value: twilioAuthToken }
}
resource secretEmail 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'email-api-key'
  properties: { value: emailApiKey }
}

// ---------- Container Apps Environment ----------
resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${resourceToken}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// La app conoce su propia URL antes de crearse: dominio del entorno + nombre fijo.
var appBaseUrl = 'https://${portalAppName}.${containerEnv.properties.defaultDomain}'
var image = empty(portalImageName) ? placeholderImage : portalImageName

// Referencias a secretos de Key Vault (versión "latest").
var kvSecretRefsBase = [
  { name: 'database-url', keyVaultUrl: secretDatabaseUrl.properties.secretUri, identity: uami.id }
  { name: 'nextauth-secret', keyVaultUrl: secretNextAuth.properties.secretUri, identity: uami.id }
  { name: 'questionnaire-token-secret', keyVaultUrl: secretQuestionnaire.properties.secretUri, identity: uami.id }
  { name: 'two-factor-encryption-key', keyVaultUrl: secretTwoFactor.properties.secretUri, identity: uami.id }
  { name: 'notification-cron-secret', keyVaultUrl: secretCron.properties.secretUri, identity: uami.id }
  { name: 'payments-webhook-secret', keyVaultUrl: secretPayments.properties.secretUri, identity: uami.id }
  { name: 'sms-api-key', keyVaultUrl: secretSms.properties.secretUri, identity: uami.id }
  { name: 'email-api-key', keyVaultUrl: secretEmail.properties.secretUri, identity: uami.id }
]

var kvSecretRefs = concat(
  kvSecretRefsBase,
  empty(twilioAuthToken) ? [] : [
    { name: 'twilio-auth-token', keyVaultUrl: secretTwilioAuthToken!.properties.secretUri, identity: uami.id }
  ]
)

var nonSecretEnv = [
  { name: 'APP_BASE_URL', value: appBaseUrl }
  { name: 'TERMS_VERSION', value: termsVersion }
  { name: 'PRIVACY_VERSION', value: privacyVersion }
  { name: 'SMS_PROVIDER', value: smsProvider }
  { name: 'SMS_BASE_URL', value: smsBaseUrl }
  { name: 'WHATSAPP_PROVIDER', value: whatsappProvider }
  { name: 'PHONE_NOTIFICATION_CHANNEL', value: phoneNotificationChannel }
  { name: 'TWILIO_ACCOUNT_SID', value: twilioAccountSid }
  { name: 'TWILIO_MESSAGING_SERVICE_SID', value: twilioMessagingServiceSid }
  { name: 'TWILIO_FROM_PHONE_NUMBER', value: twilioFromPhoneNumber }
  { name: 'TWILIO_WHATSAPP_MESSAGING_SERVICE_SID', value: twilioWhatsAppMessagingServiceSid }
  { name: 'TWILIO_WHATSAPP_FROM_PHONE_NUMBER', value: twilioWhatsAppFromPhoneNumber }
  { name: 'EMAIL_PROVIDER', value: emailProvider }
  { name: 'EMAIL_BASE_URL', value: emailBaseUrl }
  { name: 'EMAIL_FROM', value: emailFrom }
  { name: 'PAYMENTS_PROVIDER', value: paymentsProvider }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
]

var secretEnvBase = [
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'NEXTAUTH_SECRET', secretRef: 'nextauth-secret' }
  { name: 'QUESTIONNAIRE_TOKEN_SECRET', secretRef: 'questionnaire-token-secret' }
  { name: 'TWO_FACTOR_ENCRYPTION_KEY', secretRef: 'two-factor-encryption-key' }
  { name: 'NOTIFICATION_CRON_SECRET', secretRef: 'notification-cron-secret' }
  { name: 'PAYMENTS_WEBHOOK_SECRET', secretRef: 'payments-webhook-secret' }
  { name: 'SMS_API_KEY', secretRef: 'sms-api-key' }
  { name: 'EMAIL_API_KEY', secretRef: 'email-api-key' }
]

var secretEnv = concat(
  secretEnvBase,
  empty(twilioAuthToken) ? [] : [
    { name: 'TWILIO_AUTH_TOKEN', secretRef: 'twilio-auth-token' }
  ]
)

// ---------- Container App (portal) ----------
resource portalApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: portalAppName
  location: location
  // azd asocia este servicio con el componente "portal" de azure.yaml.
  tags: union(tags, { 'azd-service-name': 'portal' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${uami.id}': {} }
  }
  dependsOn: [acrPull, kvSecretsUser]
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        { server: acr.properties.loginServer, identity: uami.id }
      ]
      secrets: kvSecretRefs
    }
    template: {
      containers: [
        {
          name: 'portal'
          image: image
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: concat(nonSecretEnv, secretEnv)
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// ---------- Job de migraciones (manual: `prisma migrate deploy`) ----------
resource migrationJob 'Microsoft.App/jobs@2024-03-01' = {
  name: 'caj-migrate-${resourceToken}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${uami.id}': {} }
  }
  dependsOn: [acrPull, kvSecretsUser]
  properties: {
    environmentId: containerEnv.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 1
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: [
        { server: acr.properties.loginServer, identity: uami.id }
      ]
      secrets: [
        { name: 'database-url', keyVaultUrl: secretDatabaseUrl.properties.secretUri, identity: uami.id }
      ]
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: image
          command: ['/bin/sh', '-c']
          args: ['npx prisma migrate deploy']
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
          ]
        }
      ]
    }
  }
}

// ---------- Job cron (cola de notificaciones + limpieza) ----------
// Cada 15 min invoca los endpoints internos con el bearer del cron.
resource cronJob 'Microsoft.App/jobs@2024-03-01' = {
  name: 'caj-cron-${resourceToken}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${uami.id}': {} }
  }
  dependsOn: [acrPull, kvSecretsUser]
  properties: {
    environmentId: containerEnv.id
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 300
      replicaRetryLimit: 1
      scheduleTriggerConfig: {
        cronExpression: '*/15 * * * *'
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        { server: acr.properties.loginServer, identity: uami.id }
      ]
      secrets: [
        { name: 'notification-cron-secret', keyVaultUrl: secretCron.properties.secretUri, identity: uami.id }
      ]
    }
    template: {
      containers: [
        {
          name: 'cron'
          image: image
          command: ['node', '-e']
          args: [
            'const b=process.env.APP_BASE_URL,s=process.env.NOTIFICATION_CRON_SECRET,h={method:"POST",headers:{authorization:"Bearer "+s}};(async()=>{for(const p of ["/api/internal/notifications/dispatch","/api/internal/maintenance/cleanup"]){try{const r=await fetch(b+p,h);console.log(p,r.status)}catch(e){console.error(p,e.message)}}})()'
          ]
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'APP_BASE_URL', value: appBaseUrl }
            { name: 'NOTIFICATION_CRON_SECRET', secretRef: 'notification-cron-secret' }
          ]
        }
      ]
    }
  }
}

output containerRegistryLoginServer string = acr.properties.loginServer
output portalAppName string = portalApp.name
output portalAppUri string = 'https://${portalApp.properties.configuration.ingress.fqdn}'
output keyVaultName string = keyVault.name
