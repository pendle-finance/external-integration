# Protocol Integration

This repository contains metadata for integrating external protocols, including addresses and relevant integration URLs for various markets.

## Metadata Structure

The YAML file includes details for multiple objects (PT, YT, LP), each corresponding to different parts of the protocol with specific chain IDs, addresses, integration URLs, and descriptions.

### Fields

#### Protocols fields

 - name: The name of the protocol.
 - icon: The protocol’s logo (circular logo in PNG). The string on this field should be the same as the name of the logo file uploaded. Size limit for logo is 20KB.
 - metadata: This section contains detailed information about the protocol's integration assets.

#### Asset fields
 - chainId: chainId of the integrated assets
 - address: Address of the integrated assets (PT token address for PT integrations, LP token address for LP integration, etc)
 - integrationUrl: Link to the page that integrated the asset
 - description: Description of the asset

### Example

```yaml
name: Protocol Name 2
icon: logo.png
metadata:
  pt:
    - chainId: 1
      address: '0x332a8ee60edff0a11cf3994b1b846bbc27d3dcd6'
      integrationUrl: https://www.pendle.magpiexyz.io/stake
      description: hello it's pt
  yt:
    - chainId: 1
      address: '0x1cae47aa3e10a77c55ee32f8623d6b5acc947344'
      integrationUrl: https://www.pendle.magpiexyz.io/stake
      description: hello it's yt
  lp:
    - chainId: 1
      address: '0xcae62858db831272a03768f5844cbe1b40bb381f'
      integrationUrl: https://www.pendle.magpiexyz.io/stake
      description: hello it's lp

```

## How to Contribute

To add a new protocol or update existing data:

1. Fork this repository.
2. Add or update the YAML file with the new protocol information in the specified format.
3. Add a logo.png file to your protocol folder if there isn't any yet
4. Submit a pull request for review.

Please ensure that:

 - All fields are correctly filled.
 - The integration URL is valid and points to the appropriate page.
 - The protocol folder name must be **kebab-case**.
 - **Do not** change the global `config.json` file. This file will be automatically generated.