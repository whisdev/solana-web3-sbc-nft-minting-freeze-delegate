import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL
} from "@solana/web3.js"
import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
  toMetaplexFile,
} from "@metaplex-foundation/js"

import * as fs from "fs"

// example data for a new NFT
const nftData = [{
  name: "Pionner #18",
  symbol: "PL",
  description: "Example nft for pioneer legends",
  sellerFeeBasisPoints: 500,
  imageFile: "image/1.jpg",
}]

// freeze authority (account 2)
const admin = Keypair.fromSecretKey(Uint8Array.from([
  107, 13, 70, 95, 209, 140, 156, 213, 107, 51, 60,
  16, 1, 230, 46, 102, 88, 63, 126, 67, 233, 83,
  67, 34, 217, 229, 229, 202, 139, 46, 31, 118, 203,
  252, 46, 236, 43, 232, 153, 107, 243, 74, 166, 243,
  34, 138, 135, 82, 173, 169, 149, 219, 245, 29, 255,
  138, 34, 23, 85, 202, 20, 149, 188, 199
]));

// user authority (account 1)
const user = Keypair.fromSecretKey(Uint8Array.from([
  87, 9, 143, 118, 48, 235, 192, 210, 206, 116, 38,
  152, 172, 111, 201, 138, 209, 229, 181, 218, 144, 196,
  189, 247, 160, 239, 24, 202, 21, 216, 175, 86, 61,
  4, 202, 96, 246, 237, 124, 66, 75, 61, 11, 83,
  25, 159, 71, 134, 212, 226, 190, 70, 156, 200, 101,
  138, 137, 180, 196, 175, 220, 50, 89, 10
]));

const NETWORK = "devnet";
const RPC = "https://api.devnet.solana.com";

const connection = new Connection(RPC);

const metaplex = Metaplex.make(connection, { cluster: NETWORK })
  .use(keypairIdentity(user))
  .use(bundlrStorage({
    address: 'https://devnet.bundlr.network',
    providerUrl: RPC,
    timeout: 60000,
  }));



const balance = await connection.getBalance(user.publicKey);
console.log("Current balance is", balance / LAMPORTS_PER_SOL);

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
          address: "G2sc5mU3eLRkbRupnupzB3NTzZ85bnc9L1ReAre9dzFU",
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
  metaplex.use(keypairIdentity(user));

  const { nft } = await metaplex.nfts().create({
    uri,
    name: "SBC #1",
    symbol: "SBC",
    sellerFeeBasisPoints: 500,
    isMutable: false,
    creators: [
      {
        address: new PublicKey("57C7AjpVyicmNpE4HdbkgaoXfTo64D9j3H4c15e65CLZ"),
        authority: user,
        share: 100,
      },
    ],
    tokenOwner: new PublicKey("57C7AjpVyicmNpE4HdbkgaoXfTo64D9j3H4c15e65CLZ"),
    tokenStandard: 4
  },
    {
      commitment: "finalized"
    }
  );

  console.log(`Minted Master Edition: ${nft.address}`);

  return nft;
}

async function approveTokenDelegate(metaplex, nft) {

  await metaplex.nfts().delegate({
    nftOrSft: nft,
    authority: user,
    delegate: {
      type: "UtilityV1",
      delegate: admin.publicKey,
      owner: user.publicKey,
      data: { amount: 1 }
    }
  });
}

async function lockAsset(nft, mintAddress) {

  const metaplex = new Metaplex(connection);
  metaplex.use(keypairIdentity(admin));

  await metaplex.nfts().lock({
    nftOrSft: nft,
    authority: {
      __kind: 'tokenDelegate',
      type: "UtilityV1",
      delegate: admin,
      owner: user.publicKey,
    }
  });
}

async function main() {

  // console.log(`step1. upload metadata`);
  // const uri = await uploadMetadata(nftData[0])

  // console.log(`step2. mint master edition`);
  // const nft = await mintMasterEdition(uri);

  // const mintAddress = new PublicKey(nft.address);
  // console.log("==>",mintAddress);

  // console.log(`step3. approve token delegate`);
  // await approveTokenDelegate(metaplex, nft);

  const mintAddress = new PublicKey("5dBNduD6LAVKuXQXQLtpg4mdXM7bCxT3ouKG2DtftN7E");
  const nft = await metaplex.nfts().findByMint({ mintAddress })
  console.log('===>', mintAddress);

  console.log(`step4. lock asset`);
  await lockAsset(nft, mintAddress);
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
