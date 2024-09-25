const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function run() {
  const protocolsPath = path.join(__dirname, 'protocols');
  const combinedConfigPath = path.join(__dirname, 'config.json');

  const protocolIds = fs.readdirSync(protocolsPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory()) // Filter only directories
    .filter(dirent => fs.existsSync(path.join(protocolsPath, dirent.name, 'config.json'))) // Check if config.json exists
    .map(dirent => dirent.name);

  const data = {protocols: []};

  for (const protocolId of protocolIds) {
    const configPath = path.join(protocolsPath, protocolId, 'config.json');
    const protocolConfigStr = fs.readFileSync(configPath, 'utf8');
    const protocolConfig = formatProtocolConfig({
      id: protocolId,
      ...JSON.parse(protocolConfigStr)
    })

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
  const {metadata} = config;
  const {pt, yt, lp} = metadata;
  lowercaseAddressOfMetadata(pt);
  lowercaseAddressOfMetadata(yt);
  lowercaseAddressOfMetadata(lp);

  return config;
}

function lowercaseAddressOfMetadata(assets) {
  for (const asset of (assets ?? [])) {
    asset.address = asset.address.toLowerCase();
  }
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
