const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require("js-yaml");

async function run() {
  const protocolsPath = path.join(__dirname, 'protocols');
  const combinedConfigPath = path.join(__dirname, 'config.json');

  const protocolIds = fs.readdirSync(protocolsPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory()) // Filter only directories
    .filter(dirent =>
      fs.existsSync(path.join(protocolsPath, dirent.name, 'config.yaml')) ||
      fs.existsSync(path.join(protocolsPath, dirent.name, 'config.json')))
    .map(dirent => dirent.name);

  const data = {protocols: []};

  for (const protocolId of protocolIds) {
    let protocolConfig;

    const yamlConfigPath = path.join(protocolsPath, protocolId, 'config.yaml');
    if (fs.existsSync(yamlConfigPath)) {
      const protocolConfigStr = fs.readFileSync(yamlConfigPath, 'utf8');
      protocolConfig = formatProtocolConfig({
        id: protocolId,
        ...yaml.load(protocolConfigStr)
      })
    } else {
      let jsonConfigPath = path.join(protocolsPath, protocolId, 'config.json');
      const protocolConfigStr = fs.readFileSync(jsonConfigPath, 'utf8');
      protocolConfig = protocolConfig = formatProtocolConfig({
        id: protocolId,
        ...JSON.parse(protocolConfigStr)
      })
    }

    const {icon} = protocolConfig;

    const iconPath = path.join(__dirname, `protocols/${protocolId}/${icon}`);
    protocolConfig.hash = await createMD5(iconPath);

    data.protocols.push(protocolConfig);
  }

  fs.writeFile(combinedConfigPath, JSON.stringify(data, null, 2), (err) => {
    if (err) {
      console.error('Error writing to file', err);
    }
  });
}

function formatProtocolConfig(config) {
  const {id, name, icon, category, metadata, description} = config;
  const pt = formatMetadataAssets(metadata?.pt ?? []);
  const yt = formatMetadataAssets(metadata?.yt ?? []);
  const lp = formatMetadataAssets(metadata?.lp ?? []);

  return {
    id,
    name,
    icon,
    category: category.toLowerCase(),
    description,
    metadata: {
      pt,
      yt,
      lp,
    },
  };
}

function formatMetadataAssets(assets) {
  const result = [];
  for (const asset of (assets ?? [])) {
    const {chainId, address, integrationUrl, description, subtitle} = asset;
    result.push({
      chainId,
      address: address.toLowerCase(),
      integrationUrl,
      description,
      subtitle,
    })
  }

  return result;
}

function createMD5(filePath) {
  return new Promise((res, rej) => {
    const hash = crypto.createHash('md5');

    const rStream = fs.createReadStream(filePath);
    rStream.on('data', (data) => {
      hash.update(data);
    });
    rStream.on('end', () => {
      res(hash.digest('hex'));
    });
  })
}

void run();
