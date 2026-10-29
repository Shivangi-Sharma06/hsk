<!-- Source: https://hashfans.io/docs/Knowledge/pow | Retrieved: 2026-10-29 | Language: English -->

# Proof-of-Work (PoW)

## Introduction

*Shared source content: see [01-chain/Knowledge/pow.md](../../01-chain/Knowledge/pow.md).*

## How Proof-of-Work Operates

The PoW process involves several key steps to validate transactions and add new blocks to the chain:

*Shared source content: see [01-chain/Knowledge/pow.md](../../01-chain/Knowledge/pow.md).*```
    Block Header = (Previous Hash + Merkle Root + Timestamp + Nonce + Difficulty Target + ...)
    Goal: Find `Nonce` such that `Hash(Block Header)` < `Target Value`
    ```*Shared source content: see [01-chain/Knowledge/pow.md](../../01-chain/Knowledge/pow.md).*

## The Cryptographic Puzzle Explained

*Shared source content: see [01-chain/Knowledge/pow.md](../../01-chain/Knowledge/pow.md).*

*Shared source content: see [01-chain/Knowledge/pow.md](../../01-chain/Knowledge/pow.md).*

**Conceptual Pseudocode Example:**

```python
import hashlib
import time

class BlockHeader:
    def __init__(self, previous_hash, merkle_root, timestamp, difficulty_target):
        self.previous_hash = previous_hash
        self.merkle_root = merkle_root
        self.timestamp = timestamp
        self.difficulty_target = difficulty_target # A numerical representation of the target
        self.nonce = 0

    def calculate_hash(self):
        header_string = str(self.previous_hash) + \
                        str(self.merkle_root) + \
                        str(self.timestamp) + \
                        str(self.difficulty_target) + \
                        str(self.nonce)
        # In real blockchains, often double-hashed or using specific serialization
        return hashlib.sha256(header_string.encode()).hexdigest()

# --- Simplified Mining Loop ---
# Assume previous_hash, merkle_root are available
# Target represented conceptually as needing 'n' leading zeros
target_prefix = "0000" # Example: target needs 4 leading zeros
difficulty_target_value = int(target_prefix + "F" * (64 - len(target_prefix)), 16) # Conceptual numeric target


block_header = BlockHeader("prev_hash_abc", "merkle_xyz", int(time.time()), difficulty_target_value)

start_time = time.time()
while True:
    current_hash = block_header.calculate_hash()
    # Convert hex hash to integer for comparison
    hash_value_int = int(current_hash, 16)

    if hash_value_int < difficulty_target_value: # Check if hash meets the target
        print(f"Found valid hash! Nonce: {block_header.nonce}")
        print(f"Hash: {current_hash}")
        print(f"Time taken: {time.time() - start_time:.2f} seconds")
        # Broadcast the block with this nonce
        break
    else:
        block_header.nonce += 1 # Increment nonce and try again
        if block_header.nonce % 100000 == 0: # Print progress periodically
             print(f"Trying nonce {block_header.nonce}...")
```
