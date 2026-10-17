import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cdk from 'aws-cdk-lib'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs'
import type { AppStack } from './app-stack'
import { type EwsConfig, siteBucketName, stackName } from './config'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const GATE_FUNCTION_FILE = path.resolve(HERE, '..', 'functions', 'gate.js')

/**
 * One CloudFront distribution in front of everything: the static site from a private S3 bucket (origin access control) and /api/*
 * from the internal load balancer (VPC origin). A viewer-request function applies the shared password gate to both and routes
 * "/" to /workspace/. The credential hash lives in a Key Value Store that is empty after deployment (the gate then answers 503).
 */
export class EdgeStack extends cdk.Stack {
  readonly bucket: s3.Bucket
  readonly distribution: cloudfront.Distribution
  readonly gateStore: cloudfront.KeyValueStore

  constructor(scope: Construct, id: string, cfg: EwsConfig, app: AppStack, props: cdk.StackProps = {}) {
    super(scope, id, { ...props, env: cfg.env, stackName: stackName(cfg, 'Edge'), description: 'EWS dev: CloudFront, static site bucket and the password gate.' })

    this.bucket = new s3.Bucket(this, 'Site', {
      bucketName: siteBucketName(cfg, this),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    this.gateStore = new cloudfront.KeyValueStore(this, 'GateStore', { keyValueStoreName: 'ews-dev-gate', comment: 'Hashed shared credential for the dev password gate. Set with the runbook procedure; never in code.' })
    const gate = new cloudfront.Function(this, 'Gate', {
      functionName: 'ews-dev-gate',
      comment: 'Password gate (basic auth, hash in the Key Value Store), root redirect and single-page routing',
      code: cloudfront.FunctionCode.fromFile({ filePath: GATE_FUNCTION_FILE }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      keyValueStore: this.gateStore,
    })
    const functionAssociations = [{ function: gate, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }]

    // The API receives only the headers it uses; the viewer's Authorization header (the gate credential) is not forwarded.
    const apiRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'ApiRequestPolicy', {
      originRequestPolicyName: 'ews-dev-api',
      comment: 'Headers used by the EWS API; all query strings; no cookies',
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
        'Accept', 'Content-Type', 'Content-Digest', 'If-Match', 'If-None-Match', 'Idempotency-Key', 'Last-Event-ID',
        'X-Dev-User', 'X-Configuration-Id', 'X-Ews-Proposal', 'X-File-Name', 'X-Provenance', 'X-Version-Note',
      ),
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
    })

    this.distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: 'EWS dev site and API behind the password gate',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations,
        compress: true,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: origins.VpcOrigin.withApplicationLoadBalancer(app.loadBalancer, { protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY, readTimeout: cdk.Duration.seconds(60), keepaliveTimeout: cdk.Duration.seconds(60) }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: apiRequestPolicy,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          functionAssociations,
          compress: false, // server-sent event streams must not be buffered
        },
      },
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableLogging: false,
    })

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${this.distribution.distributionDomainName}/` })
    new cdk.CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId })
    new cdk.CfnOutput(this, 'SiteBucket', { value: this.bucket.bucketName })
    new cdk.CfnOutput(this, 'GateStoreArn', { value: this.gateStore.keyValueStoreArn })

    cdk.Tags.of(this).add('project', 'ews')
    cdk.Tags.of(this).add('env', cfg.envName)
  }
}
