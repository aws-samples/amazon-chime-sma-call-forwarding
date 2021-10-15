#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { CallForwardingWithSMA } from "../lib/call-forwarding-with-sma-stack";

const app = new cdk.App();
new CallForwardingWithSMA(app, "CallForwardingWithSMAStack", {});
