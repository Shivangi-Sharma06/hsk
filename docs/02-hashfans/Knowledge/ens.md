<!-- Source: https://hashfans.io/docs/Knowledge/ens | Retrieved: 2026-10-29 | Language: English -->

# Ethereum Name Service (ENS)

*Shared source content: see [01-chain/Knowledge/ens.md](../../01-chain/Knowledge/ens.md).*

## Core Features

- **Human-Readable Names**: Transforms complex hexadecimal addresses into simple, memorable domains (e.g., 'example.eth')
- **Decentralized Architecture**: Operates on smart contracts without centralized control
- **Extensibility**: Supports resolution for various resources beyond Ethereum addresses
- **Reverse Resolution**: Links addresses back to names, enabling applications to display user-friendly identifiers
- **Multilingual Support**: Internationalized domain names using Unicode

## Technical Components

### Registry

*Shared source content: see [01-chain/Knowledge/ens.md](../../01-chain/Knowledge/ens.md).*

- The owner of the name
- The resolver for the name
- The time-to-live for all records under the name

*Shared source content: see [01-chain/Knowledge/ens.md](../../01-chain/Knowledge/ens.md).*

### Resolvers

*Shared source content: see [01-chain/Knowledge/ens.md](../../01-chain/Knowledge/ens.md).*

- **Address Records**: Ethereum addresses (ETH) and other cryptocurrencies
- **Content Records**: IPFS hashes, Swarm hashes, and other distributed content identifiers
- **Text Records**: Email addresses, URLs, avatars, and other metadata
- **Service Records**: Information about supported services and their endpoints

### Namehash Algorithm

*Shared source content: see [01-chain/Knowledge/ens.md](../../01-chain/Knowledge/ens.md).*

```solidity
function namehash(string memory name) public pure returns (bytes32) {
    bytes32 node = 0x0000000000000000000000000000000000000000000000000000000000000000;
    string[] memory labels = splitName(name);
    
    for (uint i = labels.length; i > 0; i--) {
        node = keccak256(abi.encodePacked(node, keccak256(abi.encodePacked(labels[i-1]))));
    }
    
    return node;
}
```

*Shared source content: see [01-chain/Knowledge/ens.md](../../01-chain/Knowledge/ens.md).*

## Integration Mechanisms

### Web3 Libraries

Most Ethereum development libraries include ENS resolution capabilities:

```javascript
// ethers.js example
const provider = new ethers.providers.Web3Provider(window.ethereum);
const address = await provider.resolveName('example.eth');
const name = await provider.lookupAddress('0x123...'); // Reverse lookup
```

### ENS Public Resolver

*Shared source content: see [01-chain/Knowledge/ens.md](../../01-chain/Knowledge/ens.md).*

```solidity
// Solidity example using ENS
interface ENS {
    function resolver(bytes32 node) external view returns (Resolver);
}

interface Resolver {
    function addr(bytes32 node) external view returns (address);
}

function resolveENS(ENS ens, string memory name) public view returns (address) {
    bytes32 node = namehash(name);
    Resolver resolver = ens.resolver(node);
    return resolver.addr(node);
}
```

## Domain Management

### Registration Process

ENS domains with the .eth TLD follow a two-step registration process:

*Shared source content: see [01-chain/Knowledge/ens.md](../../01-chain/Knowledge/ens.md).*

*Shared source content: see [01-chain/Knowledge/ens.md](../../01-chain/Knowledge/ens.md).*

### Name Ownership

ENS domains are represented as ERC-721 NFTs, providing:

- Transferable ownership
- Integration with NFT marketplaces
- Standard wallet support for viewing and managing domains

### Subdomains

Domain owners can create unlimited subdomains:

- No additional registration fees
- Customizable resolver settings per subdomain
- Optional delegation of subdomain control

## Enterprise Applications

ENS provides valuable infrastructure for enterprise blockchain applications:

- **Identity Management**: Consistent identification across applications
- **Service Discovery**: Standardized location of enterprise services
- **Document Verification**: Linking to verified content hashes
- **Cross-Organization Communication**: Simplified addressing between entities

## Future Developments

The ENS ecosystem continues to evolve with new features and improvements:

- **Layer 2 Integration**: Reducing gas costs for ENS operations
- **Enhanced Privacy**: Zero-knowledge proofs for private resolution
- **Cross-Chain Resolution**: ENS compatibility across multiple blockchains
- **Improved Governance**: DAO-based community control via the ENS token

*Shared source content: see [01-chain/Knowledge/ens.md](../../01-chain/Knowledge/ens.md).*
