import * as cdk from 'aws-cdk-lib'
import { buildApp } from '../lib/build'
import { readConfig } from '../lib/config'

const app = new cdk.App()
buildApp(app, readConfig(app))
