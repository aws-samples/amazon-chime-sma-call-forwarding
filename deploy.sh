 #!/bin/bash
NODEVER="$(node --version)"
REQNODE="v12.0.0"
if ! [ "$(printf '%s\n' "$REQNODE" "$NODEVER" | sort -V | head -n1)" = "$REQNODE" ]; then 
    echo 'node must be version 12+'
    exit 1
fi
if ! [ -x "$(command -v yarn)" ]; then
  echo 'Error: yarn is not installed.' >&2
  exit 1
fi
if ! [ -x "$(command -v aws)" ]; then
  echo 'Error: aws is not installed.' >&2
  exit 1
fi
if [ -f "cdk.context.json" ]; then
    echo ""
    echo "INFO: Removing cdk.context.json"
    rm cdk.context.json
else
    echo ""
    echo "INFO: cdk.context.json not present, nothing to remove"
fi
yarn
echo ""
echo "Building CDK"
echo ""
yarn run build
echo ""
echo "Bootstrapping CDK"
echo ""
npx cdk bootstrap
echo ""
echo "Deploying CDK"
echo ""
npx cdk deploy -O client/src/cdk-outputs.json
