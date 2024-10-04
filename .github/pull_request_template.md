**PR Checklist**

- [] My protocol folder name must be **kebab-case**.
- [] I have set all necessary fields like this one below:
```yaml
name: Venus Protocol
icon: venus.png
metadata:
  pt:
    - chainId: 1
      address: '0x6ee2b5e19ecba773a352e5b21415dc419a700d1d'
      integrationUrl: >-
        https://app.venus.io/#/isolated-pools/pool/0xF522cd0360EF8c2FF48B648d53EA1717Ec0F3Ac3/market/0x76697f8eaeA4bE01C678376aAb97498Ee8f80D5C?chainId=1
      description: PT-weETH December 2024 market on Venus Protocol
  yt: []
  lp: []
```
- [] My protocol's icon is a **png** image and smaller than **20KB**.
- [] I have set asset addresses correctly according to their types (PT token address for PT integrations, LP token address for LP integration, etc).
- [] I have set the integration URL valid and it points to the appropriate page.
- [] I did not change the global config.json file. This file will be automatically generated.