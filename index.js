
import * as web3 from "@solana/web3.js"
import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL
} from "@solana/web3.js"
import { setAuthority, AuthorityType, approveChecked, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
  toMetaplexFile,
} from "@metaplex-foundation/js"
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplTokenMetadata, lockV1 } from '@metaplex-foundation/mpl-token-metadata'
import * as fs from "fs"

// interface NftData {
//   name: string
//   symbol: string
//   description: string
//   sellerFeeBasisPoints: number
//   imageFile: string
// }

// interface CollectionNftData {
//   name: string
//   symbol: string
//   description: string
//   sellerFeeBasisPoints: number
//   imageFile: string
//   isCollection: boolean
//   collectionAuthority: Signer
// }

// example data for a new NFT
const nftData = [{
  name: "Pionner #18",
  symbol: "PL",
  description: "Example nft for pioneer legends",
  sellerFeeBasisPoints: 500,
  imageFile: "image/1.jpg",
}]

// freeze authority (account 2)
const delegateKeypair = Keypair.fromSecretKey(Uint8Array.from([
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

// const NETWORK = "mainnet-beta";
// const RPC = "https://solana-mainnet.g.alchemy.com/v2/pp946jWG51JnX947vqCBmJOYoE1p61au";
const NETWORK = "devnet";
const RPC = "https://api.devnet.solana.com";

const connection = new Connection(RPC);

const balance = await connection.getBalance(user.publicKey);
console.log("Current balance is", balance / LAMPORTS_PER_SOL);

const metaplex = Metaplex.make(connection, { cluster: NETWORK }).use(keypairIdentity(user)).use(bundlrStorage({
  // address: 'https://node1.bundlr.network',
  address: 'https://devnet.bundlr.network',
  providerUrl: RPC,
  timeout: 60000,
}));

async function uploadMetadata(
  metaplex,
  nftData
)
// : Promise<string>
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
  uri,
  delegateKeypair
) {
  const metaplex = new Metaplex(connection);
  metaplex.use(keypairIdentity(user));

  // const feePayerAirdropSignature = await connection.requestAirdrop(
  //   keypair.publicKey,
  //   LAMPORTS_PER_SOL
  // );
  // await connection.confirmTransaction(feePayerAirdropSignature);
  const { nft } = await metaplex.nfts().create({
    uri,
    name: "SBC #1",
    // updateAuthority: delegateKeypair,
    // delegateKeypair: delegateKeypair,
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

async function setAuthorityOfToken(mintAddress, tokenAccountPubkey) {
  let txhash = await setAuthority(
    connection,
    user,
    mintAddress,
    user.publicKey,
    AuthorityType.FreezeAccount,
    delegateKeypair.publicKey
  )
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

  // const nft = await metaplex.nfts.findByMint(mintAddress);

  // get associated token account public key
  console.log(`step3. get associated token account`);
  const tokenAccountPubkey = await getAssociatedTokenAccount(user.publicKey, mintAddress);

  // // set authority of token account
  // console.log(`setp4. set authority of token account`);
  // const setAuthority = await setAuthorityOfToken(mintAddress, tokenAccountPubkey);

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
