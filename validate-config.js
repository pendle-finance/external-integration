const fs = require('fs');
const path = require('path');

function isValidEthereumAddress(address) {
  const ethereumAddressPattern = /^0x[a-fA-F0-9]{40}$/;
  return ethereumAddressPattern.test(address);
}

async function main() {
  const CHANGED_PROTOCOLS = process.env.CHANGED_PROTOCOLS;

  if (!CHANGED_PROTOCOLS) {
    console.log('No changed protocols');
    return;
  }

  const protocols = CHANGED_PROTOCOLS.split('\n');

  console.log('Currently validating protocols:', protocols);

  protocols.forEach((protocol) => validateConfig(protocol));

  console.log('Everything is fine.....')
}

function validateConfig(protocol) {
  const protocolsPath = path.join(__dirname, 'protocols');
  const configPath = path.join(protocolsPath, protocol, 'config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`protocol ${protocol}: config.json not found`);
  }

  const protocolConfigStr = fs.readFileSync(configPath, 'utf8');
  const protocolConfig = JSON.parse(protocolConfigStr);

  if (typeof protocolConfig !== 'object'){
    throw new Error(`protocol ${protocol}: config is not an object`);
  }

  const {name, icon, metadata} = protocolConfig;

  if (!mustBeNonEmptyString(name)) {
    throw new Error(`protocol ${protocol}: invalid field 'name'`);
  }

  if (!mustBeNonEmptyString(icon)) {
    throw new Error(`protocol ${protocol}: invalid field 'icon'`);
  }

  if (!(icon.endsWith('.png') && icon.length > 4)) {
    throw new Error(`protocol ${protocol}: icon must be a valid png image`);
  }

  if (typeof metadata !== 'object') {
    throw new Error(`protocol ${protocol}: invalid field 'metadata'`);
  }

  const iconPath = path.join(protocolsPath, protocol, icon);
  if (!fs.existsSync(iconPath)) {
    throw new Error(`protocol ${protocol}: icon path not found for protocol ${icon}`);
  }

  const {pt, yt, lp} = metadata;
  checkMetadataField(pt, protocol, 'pt');
  checkMetadataField(yt, protocol, 'yt');
  checkMetadataField(lp, protocol, 'lp');
}

function mustBeNonEmptyString(str) {
  return typeof str === 'string' && str.trim() !== '';
}

function checkMetadataField(data, protocol, field) {
  if (data === null || data === undefined) {
    return;
  }

  if (!Array.isArray(data)) {
    throw new Error(`protocol ${protocol}: metadata ${field} must be an array`)
  }

  for (let index = 0; index < data.length; index ++) {
    const item = data[index];
    const {chainId, address, description, integrationUrl} = item;

    if (typeof chainId !== 'number') {
      throw new Error(`protocol ${protocol}: metadata ${field} invalid 'chainId' field at index ${index}`);
    }

    if (!mustBeNonEmptyString(address) || !isValidEthereumAddress(address)) {
      throw new Error(`protocol ${protocol}: metadata ${field} invalid 'address' field at index ${index}`);
    }

    if (!mustBeNonEmptyString(description)) {
      throw new Error(`protocol ${protocol}: metadata ${field} invalid 'description' field at index ${index}`);
    }

    if (!mustBeNonEmptyString(integrationUrl)) {
      throw new Error(`protocol ${protocol}: metadata ${field} invalid 'integrationUrl' field at index ${index}`);
    }
  }
}

void main()