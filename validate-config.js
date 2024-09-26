const fs = require('fs');
const path = require('path');

function isValidEthereumAddress(address) {
  const ethereumAddressPattern = /^0x[a-fA-F0-9]{40}$/;
  return ethereumAddressPattern.test(address);
}

function isKebabCase(str) {
  const kebabCaseRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  return kebabCaseRegex.test(str);
}

async function main() {
  const CHANGED_PROTOCOLS = process.env.CHANGED_PROTOCOLS;
  const GET_ASSET_LIST_URL = process.env.GET_ASSET_LIST_URL;

  if (!CHANGED_PROTOCOLS) {
    console.log('No changed protocols');
    return;
  }

  if (!GET_ASSET_LIST_URL) {
    throw new Error('GET_ASSET_LIST_URL is missing');
  }

  const assetMap = await getAssetList(GET_ASSET_LIST_URL);

  const protocols = CHANGED_PROTOCOLS.split('\n');

  console.log('Currently validating protocols:', protocols);

  protocols.forEach((protocol) => validateConfig(protocol, assetMap));

  console.log('Everything is fine.....')
}

function validateConfig(protocol, assetMap) {
  const {ptMap, ytMap, lpMap} = assetMap;

  if (!isKebabCase(protocol)) {
    throw new Error(`protocol ${protocol}: protocol name must be in kebab-case`);
  }

  const protocolsPath = path.join(__dirname, 'protocols', protocol);

  // check protocol folder exists or not, if not exists we bypass cause it's a deleted protocol
  try {
    const stats = fs.statSync(protocolsPath);
    if (!stats.isDirectory()) {
      throw new Error(`protocol ${protocol}: protocols/${protocol} is a file, not a folder`);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      // folder not exists
      return;
    } else {
      throw new Error(`protocol ${protocol}: An error occur when read protocol folder: ${err}`);
    }
  }

  const configPath = path.join(protocolsPath, 'config.json');

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

  const iconPath = path.join(protocolsPath, icon);
  if (!fs.existsSync(iconPath)) {
    throw new Error(`protocol ${protocol}: icon path not found for protocol ${icon}`);
  }

  const {pt, yt, lp} = metadata;
  checkMetadataField(pt, protocol, 'pt', ptMap);
  checkMetadataField(yt, protocol, 'yt', ytMap);
  checkMetadataField(lp, protocol, 'lp', lpMap);
}

function mustBeNonEmptyString(str) {
  return typeof str === 'string' && str.trim() !== '';
}

function checkMetadataField(data, protocol, field, assetMap) {
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
      throw new Error(`protocol ${protocol}: metadata ${field} address is not a valid ethereum address at index ${index}`);
    }

    if (!((`${chainId}-${address}`.toLowerCase()) in assetMap)) {
      throw new Error(`protocol ${protocol}: metadata ${field} address not found in pendle ${field} list at index ${index}`);
    }

    if (!mustBeNonEmptyString(description)) {
      throw new Error(`protocol ${protocol}: metadata ${field} invalid 'description' field at index ${index}`);
    }

    if (!mustBeNonEmptyString(integrationUrl)) {
      throw new Error(`protocol ${protocol}: metadata ${field} invalid 'integrationUrl' field at index ${index}`);
    }
  }
}

async function getAssetList(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`response from getting asset list is not okay: ${response}`);
  }

  const { data } = await response.json();

  const ptMap = {};
  const ytMap = {};
  const lpMap = {};

  for (const chainData of data) {
    const {chainId, markets, pts, yts} = chainData;
    if (pts) {
      pts.map((pt) => ptMap[`${chainId}-${pt}`] = true)
    }

    if (yts) {
      yts.map((yt) => ytMap[`${chainId}-${yt}`] = true)
    }

    if (markets) {
      markets.map((market) => lpMap[`${chainId}-${market}`] = true)
    }
  }

  return {ptMap, ytMap, lpMap};
}

void main()