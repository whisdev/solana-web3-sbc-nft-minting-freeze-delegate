import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction
} from "@solana/web3.js"
import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
  toMetaplexFile,
} from "@metaplex-foundation/js"

import base58 from "bs58"
import * as fs from "fs"

// Type admin private key
const adminKey = "type admin private key"

// Type user private key
const userKey = "type user private key"

// example data for a new NFT
const nftData = [{
  name: "SBC #18",
  symbol: "sbc",
  description: "Example nft for SBC project",
  sellerFeeBasisPoints: 500,
  imageFile: "image/1.jpg",
}]

// freeze authority (account 2)
const admin = Keypair.fromSecretKey(
  base58.decode(
    adminKey
  )
);

// owner authority (account 1)
const owner = Keypair.fromSecretKey(
  base58.decode(
    userKey
  )
);

const NETWORK = "devnet";
const RPC = "https://api.devnet.solana.com";

const connection = new Connection(RPC);

const metaplex = Metaplex.make(connection, { cluster: NETWORK })
  .use(keypairIdentity(owner))
  .use(bundlrStorage({
    address: 'https://devnet.bundlr.network',
    providerUrl: RPC,
    timeout: 60000,
  }));

async function uploadMetadata(nftData) {
  // file to buffer
  const buffer = fs.readFileSync(nftData.imageFile)

  // buffer to metaplex file
  const file = toMetaplexFile(buffer, nftData.imageFile)

  // upload image and get image uri
  const imageUri = await metaplex.storage().upload(file)
  console.log("image uri:", imageUri);

  const { uri } = await metaplex.nfts().uploadMetadata({
    name: nftData.name,
    symbol: nftData.symbol,
    description: nftData.description,
    seller_fee_basis_points: nftData.sellerFeeBasisPoints,
    external_url: "",
    properties: {
      files: [
        {
          uri: imageUri,
          type: "image/png",
        },
      ],
      category: "image",
      creators: [
        {
          address: owner.publicKey,
          share: 100
        }
      ],
    },
    attributes: [
      {
        trait_type: "Faction",
        value: "Third Faction"
      }
    ],
    image: imageUri,
  })

  console.log("metadata uri:", uri)
  return uri
}

async function mintMasterEdition(uri) {

  const metaplex = new Metaplex(connection);
  metaplex.use(keypairIdentity(owner));

  const { nft } = await metaplex.nfts().create({
    uri,
    name: "SBC #1",
    symbol: "SBC",
    sellerFeeBasisPoints: 500,
    isMutable: true,
    creators: [
      {
        address: new PublicKey(owner.publicKey),
        authority: owner,
        share: 100,
      },
    ],
    tokenOwner: new PublicKey(owner.publicKey),
    tokenStandard: 4
  },
    {
      commitment: "finalized"
    }
  );

  console.log(`Minted Master Edition: ${nft.address}`);

  return nft;
}

async function delegateAndLockToken(nft) {

  const delegateTransaction = await makeDelegate(nft);
  const lockTransaction = await makeLockTransaction(nft);

  const transaction = new Transaction().add(
    ...delegateTransaction,
    ...lockTransaction
  )

  const bh = await connection.getLatestBlockhash();
  transaction.feePayer = owner.publicKey;
  transaction.recentBlockhash = bh.blockhash;
  transaction.lastValidBlockHeight = bh.lastValidBlockHeight

  transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: true
  })

  await sendAndConfirmTransaction(connection, transaction, [owner, admin])

}

async function makeDelegate(nft) {

  metaplex.use(keypairIdentity(owner));

  const delegateTransaction = metaplex.nfts().builders().delegate({
    nftOrSft: nft,
    authority: owner,
    delegate: {
      type: "UtilityV1",
      delegate: admin.publicKey,
      owner: owner.publicKey,
      data: { amount: 1 }
    }
  });

  const delegateTransactions = delegateTransaction.getInstructions();
  return delegateTransactions;
}

async function makeLockTransaction(nft) {

  metaplex.use(keypairIdentity(admin));

  const lockTransaction = metaplex.nfts().builders().lock({
    nftOrSft: nft,
    authority: {
      __kind: 'tokenDelegate',
      type: "UtilityV1",
      delegate: admin,
      owner: owner.publicKey,
    }
  });

  const lockTransactions = lockTransaction.getInstructions();
  return lockTransactions;
}

async function main() {

  console.log(`step1. upload metadata`);
  const uri = await uploadMetadata(nftData[0])

  console.log(`step2. mint master edition`);
  const nft = await mintMasterEdition(uri);

  console.log(`step3. approve token delegate`);
  await delegateAndLockToken(nft);

}

main()
  .then(() => {
    console.log("Finished successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })
