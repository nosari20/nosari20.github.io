---
title: "Cryptography basics"
date: 2022-12-13
lastmod: 2022-12-13
draft: false
tags: ["misc", "security", "cryptography"]
summary:  "How can Alice send data to Bob securely?"
image: "/posts/cryptography-basics/_header.png"
ogimage: "/posts/cryptography-basics/_og.png"
githubissueID: "6" 
---

## Content
* Preamble
* symmetric encryption
* Asymertric encryption
* Hash functions
* Digital signature
* Protocols
* Digital certificates
* Common usages

## Preamble

### Who are Alice and Bob?

Alice and Bob are fictional characters used in cryptography to illustrate scenarios (source : [Wikipedia](https://en.wikipedia.org/wiki/Alice_and_Bob)).

The main characters are the following:
* Alice: the sender
* Bob: the recipient
* Eve: passive attacker (listens to conversations)
* Mallory: active attacker (listens, modifies or impersonates conversations)

### Notation

| Notation                               | Description                                                    |
|----------------------------------------|----------------------------------------------------------------|
| {{<  mathjax/inline `K_s` >}}          | Secret/Shared key                                              |
| {{<  mathjax/inline `K_{priv}^X` >}}   | X's private key                                                |
| {{<  mathjax/inline `K_{pub}^X` >}}    | X's public key                                                 |
| {{<  mathjax/inline `E(K,M)` >}}       | Encrypt message M with key K                                   |
| {{<  mathjax/inline `D(K,C)` >}}       | Decrypt cipher C with key K                                    |
| {{<  mathjax/inline `S(K,M)` >}}       | Sign message M with key K                                      |
| {{<  mathjax/inline `V(K,M)` >}}       | Verify that M is signed with private key associated with key K |
| {{<  mathjax/inline `h(X)` >}}         | Hash of X                                                      |
| {{<  mathjax/inline `N_x` >}}          | Nonce (unique random number), x represents the instance        |

## Symmetric encryption

The simplest way to share data securely is using symmetric encryption (e.g. [AES](https://fr.wikipedia.org/wiki/Advanced_Encryption_Standard)). In this scenario, Alice and Bob agreed on a share key {{<  mathjax/inline `K_s` >}} beforehand and then encrypt the messages with it. All messages are encrypted with the same key.

### Basic protocol

0. Alice and Bob agreed on a shared key {{<  mathjax/inline `K_s` >}} using an already secured and authenticated channel
1. Alice encrypts plain text {{<  mathjax/inline `M` >}} as {{<  mathjax/inline `E(K_s,M) \to C` >}}  
2. Alice sends cipher {{<  mathjax/inline `C` >}} to Bob
3. Bob decrypts cipher as {{<  mathjax/inline `D(K_s,C) \to M` >}} 

### Limitations

1. Alice and Bob have a secured and authenticated channel to share keys
2. If {{<  mathjax/inline `K_s` >}} is leaked, Eve can decrypt all the conversations in live or afterward and Mallory can create new messages
3. Mallory can replay some messages after being sent by Alice or Bob. This can be mitigated by using nonce to authenticate messages (first nonce sent by Alice on a secured and authenticated channel)

## Asymmetric encryption

Asymmetric encryption (e.g. [RSA](https://en.wikipedia.org/wiki/RSA_(cryptosystem))) removes the need for a secure channel as a prerequisite for the conversation as it uses a publicly shareable key {{<  mathjax/inline `K_{pub}` >}} to encrypt data and a private key {{<  mathjax/inline `K_{priv}` >}} to decrypt data. 

### Basic protocol

0. Alice and Bob share their public keys {{<  mathjax/inline `K_{pub}^{Alice}` >}} and {{<  mathjax/inline `K_{pub}^{Bob}` >}} on a public channel
1. Alice encrypts plain text {{<  mathjax/inline `M` >}} as {{<  mathjax/inline `E(K_{pub}^{Bob},M) \to C` >}}  
2. Alice sends cipher {{<  mathjax/inline `C` >}}   to Bob
3. Bob decrypts cipher as {{<  mathjax/inline `D(K_{priv}^{Bob},C) \to M` >}} 

### Limitations

1. Mallory can replay some messages after being sent by Alice or Bob, this can be mitigated by using nonce to authenticate messages (first non send  by Alice on a secured and authenticated channel)
2. Asymmetric encryption algorithms consume more resources than symmetric encryption ones

## Hash functions

Hash functions {{<  mathjax/inline `h(X)` >}} (e.g. [SHA](https://en.wikipedia.org/wiki/Secure_Hash_Algorithms))) are used to convert data of any length to a fixed length data. This operation cannot be undone by design. Plain text cannot be retrieved from hash (note: some implementations are weak, so input can be retrieved and it is possible to find multiple values for the same hash). Hash functions are used to check data integrity and in authentication processes. 

### Basic protocol

0. Alice and Bob agreed on a nonce {{<  mathjax/inline `N_0` >}} using an already secured and authenticated channel
1. Alice hash plain text {{<  mathjax/inline `M` >}} and nonce {{<  mathjax/inline `N_0` >}} as {{<  mathjax/inline `h(M,N_0) \to H_{MN_0}` >}}  
2. Alice send plain text {{<  mathjax/inline `M` >}} and hash to Bob {{<  mathjax/inline `H_{MN_0}` >}} to Bob
3. Bob hash received plain text {{<  mathjax/inline `M_r` >}} and nonce {{<  mathjax/inline `N_0` >}} as {{<  mathjax/inline `h(M_r,N_0) \to H_{M_rN_0}` >}} and compare it to received hash from Alice
4. If {{<  mathjax/inline `H_{M_rN_0} = H_{MN_0}` >}} then, this means that message {{<  mathjax/inline `M_r` >}} is equal to {{<  mathjax/inline `M` >}} and so is from Alice (the message is authenticated).

### Limitations

1. Alice and Bob have a secured and authenticated channel to share first nonce
2. In this example, nothing is encrypted and so Eve can read everything

## Digital signature

Digital signature (e.g. [RSA](https://en.wikipedia.org/wiki/RSA_(cryptosystem))) are used to authenticate data using asymmetric encryption keys without any authenticated channel as a prerequisite of the conversation. The sender signs data using his own private key {{<  mathjax/inline `K_{priv}` >}} (the data hash is signed instead of the full data), and the recipient authenticates the data received using the sender's public key {{<  mathjax/inline `K_{pub}` >}}. 

### Basic protocol

1. Alice sends message {{<  mathjax/inline `M` >}} with signature {{<  mathjax/inline `S(K_{priv}^{Alice},h(L))` >}} to Bob
2. Bob receives message {{<  mathjax/inline `M_r` >}} and verifies that it is signed with Alice's private key using a verification algorithm as {{<  mathjax/inline `V(K_{pub}^{Alice},h(M_r)` >}}. If {{<  mathjax/inline `V` >}} returns true, then this means that message {{<  mathjax/inline `M_r` >}} is equal to {{<  mathjax/inline `M` >}} and so is from Alice (the message is authenticated).

### Limitations

1. Mallory can replay messages
2. In this example, nothing is encrypted and so Eve can read everything
3. Bob has to make sure that {{<  mathjax/inline `K_{pub}^{Alice}` >}} is really owned by Alice and not by Mallory

## Protocols

Cryptographic protocols (e.g. [TLS](https://en.wikipedia.org/wiki/Transport_Layer_Security) wrapp-up all the above systems to create secured and authenticated channel, they have to prevent the following attacks types (not exhaustive):
* Read (live and after session)
* Replay
* Modification
* Repudiation
* Impersonation

## Digital certificates (aka public key certificates)

Digital certificates (e.g. [x509 certificates](https://fr.wikipedia.org/wiki/X.509)) aim to authenticate public keys with a trust chain system (each certificate is signed by an 'issuer' until reaching certification authority signature which must be trusted by devices/users). A digital certificate contains multiple fields including public key, common name of the public key owner, serial number, validity and issuer identity (see example below).

{{< rawhtml >}}
<div>
  <img alt="Wikipedia.org digital certificate" src="/posts/cryptography-basics/wikipedia-certificate.png" style="max-width:340px;margin:auto;display:block;border:1px solid black;">
</div>
{{< /rawhtml >}}

## Common usages

### Secure web browsing

#### Scenario

Alice navigates to a website ``bob.io`` using HTTPS and so her browser authenticates server and encrypts data.

#### Prerequisites

* ``bob.io`` must have a public trusted certificate (i.e. signed by a certificate authority which is shipped with OS) or Alice must trust ``bob.io`` certificate authority (e.g. for intranet).

#### Diagram

![Secure web browsing diagram](/posts/cryptography-basics/server-athentication.drawio.png)
### Password authentication

#### Scenario

Alice logged to ``https://bob.io`` using her password.

#### Prerequisites

* Alice must be registered on ``bob.io``

#### Diagram
![Password authentication](/posts/cryptography-basics/password-auth.drawio.png)
### File integrity

#### Scenario

Alice downloads a file from ``https://bob.io`` and wants to verify the file integrity to make sure that the file was not altered during download.

#### Prerequisites

* ``bob.io`` must provide a hash values of files available for download (usually multiple values using multiple algorithms).

#### Diagram

![File integrity check](/posts/cryptography-basics/file-integrity.drawio.png)
### Mail signature (aka S/MIME)

#### Scenario

Alice sent a signed and encrypted mail to Bob (they don't use the same mail server).

#### Prerequisites

* Bob and Alice must have their own certificate with private key issued by a certificate authority which is trusted by both (CAs can be different)
* Alice's server must host Alice's public key
* Bob's server must host Bob's public key

#### Diagram

![Secure email](/posts/cryptography-basics/secure-email.drawio.png)
## Sources / usefull resources
* https://en.wikipedia.org/wiki/Alice_and_Bob
* https://en.wikipedia.org/wiki/RSA_
* https://www.devglan.com/online-tools/rsa-encryption-decryption
* https://en.wikipedia.org/wiki/Secure_Hash_Algorithms
* https://en.wikipedia.org/wiki/Transport_Layer_Security
* https://fr.wikipedia.org/wiki/Advanced_Encryption_Standard
* https://fr.wikipedia.org/wiki/X.509
