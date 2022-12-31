import * as bs58 from 'bs58'
import * as ByteBuffer from 'bytebuffer'
import { types } from './chain/deserializer'
import { Types } from './chain/serializer'
import { PrivateKey, PublicKey } from './crypto'
import * as Aes from './helpers/aes'

/**
 * Memo/Any message encoding using AES (aes-cbc algorithm)
 * @param {Buffer|String} private_key Privatekey of sender
 * @param {Buffer|String}public_key publickey of recipient
 * @param {String}memo message to be encrypted
 * @param {Number}testNonce nonce with high entropy
 */
function encode(private_key: PrivateKey | string, public_key: PublicKey | string, memo: string, testNonce?: number) {
    if (!memo.startsWith('#')) {return memo}
    memo = memo.substring(1)

    private_key = toPrivateObj(private_key) as PrivateKey
    public_key = toPublicObj(public_key) as PublicKey

    const { nonce, message, checksum } = Aes.encrypt(private_key, public_key, memo, testNonce)

    const mbuf = new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, ByteBuffer.LITTLE_ENDIAN)
    Types.EncryptedMemo(mbuf, {
        check: checksum,
        encrypted: message,
        from: private_key.createPublic(),
        nonce,
        to: public_key
    })
    mbuf.flip()
    const data = Buffer.from(mbuf.toBuffer())
    return '#' + bs58.encode(data)
}

/**
 * Encrypted memo/message decryption
 * @param {Buffer|string}private_key Privatekey of recipient
 * @param {any}memo Encrypted message/memo
 */
function decode(private_key: PrivateKey | string, memo: any) {
    if (!memo.startsWith('#')) {return memo}
    memo = memo.substring(1)
    // checkEncryption()

    private_key = toPrivateObj(private_key) as PrivateKey

    memo = bs58.decode(memo)
    memo = types.EncryptedMemoD(Buffer.from(memo, 'binary'))

    const { from, to, nonce, check, encrypted } = memo
    const pubkey = private_key.createPublic().toString()
    const otherpub = pubkey === new PublicKey(from.key).toString() ? new PublicKey(to.key) : new PublicKey(from.key)
    memo = Aes.decrypt(private_key, otherpub, nonce, encrypted, check)

    // remove varint length prefix
    const mbuf = ByteBuffer.fromBinary(memo.toString('binary'), ByteBuffer.LITTLE_ENDIAN)
    try {
        mbuf.mark()
        return '#' + mbuf.readVString()
    } catch (e) {
        mbuf.reset()
        // Sender did not length-prefix the memo
        memo = Buffer.from(mbuf.toString('binary'), 'binary').toString('utf-8')
        return '#' + memo
    }
}

const toPrivateObj = (o) => (o ? o.key ? o : PrivateKey.fromString(o) : o/* null or undefined*/)
const toPublicObj = (o) => (o ? o.key ? o : PublicKey.fromString(o) : o/* null or undefined*/)

export const Memo = {
    decode,
    encode
}
