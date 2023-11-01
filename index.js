
import * as web3 from "@solana/web3.js"
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL
} from "@solana/web3.js"
import { approveChecked, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token"
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
const delegateKeypair = "......................."

// user authority (account 1)
const user = "........................."

const NETWORK = "devnet";
const RPC = "https://api.devnet.solana.com";

const connection = new Connection(RPC);

const balance = await connection.getBalance(user.publicKey);
console.log("Current balance is", balance / LAMPORTS_PER_SOL);

const metaplex = Metaplex.make(connection, { cluster: NETWORK }).use(keypairIdentity(user)).use(bundlrStorage({
  address: 'https://devnet.bundlr.network',
  providerUrl: RPC,
  timeout: 60000,
}));

async function uploadMetadata(
  metaplex,
  nftData
)
{
  // file to buffer
  const buffer = fs.readFileSync(nftData.imageFile)

  // buffer to metaplex file
  const file = toMetaplexFile(buffer, nftData.imageFile)

  // upload image and get image uri
  const imageUri = await metaplex.storage().upload(file)

  // const imageUri = "https://ik.imagekit.io/u92vdglg9/spritebox/dracula.png";
  console.log("image uri:", imageUri);

  // upload metadata and get metadata uri (off chain metadata)
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

async function mintMasterEdition(
  uri
) {
  const metaplex = new Metaplex(connection);
  metaplex.use(keypairIdentity(user));

  // await connection.confirmTransaction(feePayerAirdropSignature);
  const { nft } = await metaplex.nfts().create({
    uri,
    name: "SBC #1",
    symbol: "SBC",
    sellerFeeBasisPoints: 500,
    creators: [
      {
        address: new PublicKey("57C7AjpVyicmNpE4HdbkgaoXfTo64D9j3H4c15e65CLZ"),
        authority: user,
        share: 100,
      },
    ],
    tokenOwner: new PublicKey("57C7AjpVyicmNpE4HdbkgaoXfTo64D9j3H4c15e65CLZ")
  },
    {
      commitment: "finalized"
    }
  );

  const mintAddress = nft.address

  console.log(`Minted Master Edition: ${mintAddress}`);

  return mintAddress;
}

async function getAssociatedTokenAccount(owner, mintPubkey) {
  const tokenAccountPubkey = (PublicKey.findProgramAddressSync(
    [
      owner.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mintPubkey.toBuffer()
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  ))[0];

  return tokenAccountPubkey
}

async function approveTokenDelegate(mintAddress, tokenAccountPubkey) {

  let txhash = await approveChecked(
    connection,
    user,
    mintAddress,
    tokenAccountPubkey,
    delegateKeypair.publicKey,
    user.publicKey,
    1,
    0
  )
  console.log(`txhash: ${txhash}`);
}

async function lockAsset(mintAddress) {

  const nft = await metaplex.nfts().findByMint({mintAddress})

  await metaplex.nfts().lock({
    nftOrSft: nft,
    authority: {
        __kind: 'tokenDelegate',
        type: 'UtilityV1',
        delegate: delegateKeypair,
        owner: user.publicKey,
    }
  });
}

async function main() {

  // get upload metadata uri
  console.log(`step1. upload metadata`);
  const uri = await uploadMetadata(metaplex, nftData[0])

  // mint NFT
  console.log(`step2. mint master edition`);
  const mintAddress = await mintMasterEdition(uri);

  // get associated token account public key
  console.log(`step3. get associated token account`);
  const tokenAccountPubkey = await getAssociatedTokenAccount(user.publicKey, mintAddress);

  // approve token delegate
  console.log(`step4. approve token delegate`);
  await approveTokenDelegate(mintAddress, tokenAccountPubkey);

  // lock asset
  console.log(`step5. lock asset`);
  await lockAsset(mintAddress);
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
