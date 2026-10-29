import {Type, type Static, type TSchema} from '@sinclair/typebox';
import {Value} from '@sinclair/typebox/value';
import {canonicalize} from 'json-canonicalize';
import {getAddress,hashTypedData,keccak256,toBytes,verifyTypedData,type Hex} from 'viem';

export const protocolVersion='proofbid/2' as const;
export const hash=(value:unknown):Hex=>keccak256(toBytes(canonicalize(value)));
export const deployment={id:hash('proofbid-local-v2'),chainId:133,token:'0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6' as Hex,decimals:6,mode:'local' as const};
export const nowSeconds=()=>Math.floor(Date.now()/1000);
export const newId=():Hex=>`0x${Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')}`;
const obj=<T extends Record<string,TSchema>>(properties:T)=>Type.Object(properties,{additionalProperties:false});
const id=Type.Unsafe<Hex>(Type.String({pattern:'^0x[0-9a-f]{64}$'}));
const address=Type.Unsafe<Hex>(Type.String({pattern:'^0x[0-9a-fA-F]{40}$'}));
const amount=Type.String({pattern:'^[1-9][0-9]{0,77}$'});
const timestamp=Type.Integer({minimum:1,maximum:Number.MAX_SAFE_INTEGER});
export const scenarioSchema=Type.Union(['honest','price','payee','unknown','slow-delivery'].map(v=>Type.Literal(v)));
export type Scenario=Static<typeof scenarioSchema>;
export const requestSchema=obj({fixture:Type.Union([Type.Literal('customers'),Type.Literal('inventory')]),budget:Type.String({pattern:'^(0|[1-9][0-9]{0,5})(\\.[0-9]{1,6})?$',maxLength:14}),maxDeliverySeconds:Type.Integer({minimum:10,maximum:120}),scenario:scenarioSchema});
export type RequestInput=Static<typeof requestSchema>;
export const rfqSchema=obj({protocolVersion:Type.Literal(protocolVersion),deploymentId:id,rfqId:id,buyer:address,chainId:Type.Literal(133),token:address,fixture:Type.Union([Type.Literal('customers'),Type.Literal('inventory')]),sku:Type.Literal('dataset-quality-report/v1'),inputHash:id,quantity:Type.Literal(1),maxAmountBaseUnits:amount,maxDeliverySeconds:Type.Integer({minimum:10,maximum:120}),collectionClosesAt:timestamp,createdAt:timestamp});
export type Rfq=Static<typeof rfqSchema>;
export const termsSchema=obj({schemaVersion:Type.Literal(1),sku:Type.Literal('dataset-quality-report/v1'),inputHash:id,analyzerVersion:Type.Literal('1'),deliveryWithinSeconds:Type.Integer({minimum:1,maximum:120}),permittedUse:Type.Literal('buyer-internal-use')});
export type Terms=Static<typeof termsSchema>;
export const quoteSchema=obj({rfqId:id,rfqHash:id,quoteId:id,buyer:address,vendorSigner:address,payee:address,token:address,amountBaseUnits:amount,quantity:Type.Literal('1'),skuHash:id,inputHash:id,termsHash:id,issuedAt:timestamp,validUntil:timestamp,nonce:id});
export type Quote=Static<typeof quoteSchema>;
export const signedQuoteSchema=obj({vendorId:Type.String({pattern:'^[a-c]$'}),quote:quoteSchema,terms:termsSchema,signature:Type.String({pattern:'^0x[0-9a-f]{130}$'})});
export type SignedQuote=Static<typeof signedQuoteSchema>;
export type Vendor={id:string;name:string;signer:Hex;payee:Hex;amountBaseUnits:string;deliverySeconds:number};
export const quoteTypes={Quote:[{name:'rfqId',type:'bytes32'},{name:'rfqHash',type:'bytes32'},{name:'quoteId',type:'bytes32'},{name:'buyer',type:'address'},{name:'vendorSigner',type:'address'},{name:'payee',type:'address'},{name:'token',type:'address'},{name:'amountBaseUnits',type:'uint256'},{name:'quantity',type:'uint256'},{name:'skuHash',type:'bytes32'},{name:'inputHash',type:'bytes32'},{name:'termsHash',type:'bytes32'},{name:'issuedAt',type:'uint64'},{name:'validUntil',type:'uint64'},{name:'nonce',type:'bytes32'}]} as const;
export const quotePayload=(q:Quote)=>({domain:{name:'ProofBidQuote',version:'2',chainId:deployment.chainId,salt:deployment.id},types:quoteTypes,primaryType:'Quote' as const,message:{...q,amountBaseUnits:BigInt(q.amountBaseUnits),quantity:BigInt(q.quantity),issuedAt:BigInt(q.issuedAt),validUntil:BigInt(q.validUntil)}});
export const quoteDigest=(q:Quote)=>hashTypedData(quotePayload(q));
export function parse<T extends TSchema>(schema:T,value:unknown):Static<T>{if(!Value.Check(schema,value))throw new Error('Invalid message schema');return value as Static<T>;}
export function units(value:string,decimals=6):bigint {
 if(!Number.isInteger(decimals)||decimals<0||decimals>18||!new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{1,${Math.max(decimals,1)}})?$`).test(value)||(decimals===0&&value.includes('.')))throw new Error('Invalid amount or precision');
 const [whole,fraction='']=value.split('.');const result=BigInt(whole!)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0');
 if(result<=0n||result>2n**256n-1n)throw new Error('Amount out of range');return result;
}
export const formatAmount=(value:string)=>{const n=BigInt(value);return `${n/1000000n}.${(n%1000000n).toString().padStart(6,'0')}`;};
export const sameAddress=(a:string,b:string)=>getAddress(a)===getAddress(b);
export const fixtures={
 customers:[{id:'c1',email:'alice@example.test',country:'IN'},{id:'c2',email:'',country:'GB'},{id:'c1',email:'alice@example.test',country:'IN'},{id:'c3',email:'chen@example.test',country:''}],
 inventory:[{id:'i1',sku:'SENSOR-01',location:'A'},{id:'i2',sku:'',location:'B'},{id:'i3',sku:'SENSOR-03',location:'A'}]
} as const;
export function analyze(fixture:keyof typeof fixtures){const rows=fixtures[fixture];const unique=new Set(rows.map(row=>canonicalize(row)));return {schemaVersion:1 as const,analyzerVersion:'1',inputHash:hash(rows),rowCount:rows.length,duplicateCount:rows.length-unique.size,missingFieldCount:rows.reduce((n,row)=>n+Object.values(row).filter(v=>v==='').length,0)};}
export type Report=ReturnType<typeof analyze>;
export function createRfq(input:RequestInput,buyer:string,at=nowSeconds()):Rfq {parse(requestSchema,input);return {protocolVersion,deploymentId:deployment.id,rfqId:newId(),buyer:getAddress(buyer),chainId:133,token:deployment.token,fixture:input.fixture,sku:'dataset-quality-report/v1',inputHash:hash(fixtures[input.fixture]),quantity:1,maxAmountBaseUnits:units(input.budget).toString(),maxDeliverySeconds:input.maxDeliverySeconds,collectionClosesAt:at+5,createdAt:at};}
export async function verifyQuote(signed:SignedQuote,rfq:Rfq,vendor:Vendor,at=nowSeconds(),headroom=60){
 parse(signedQuoteSchema,signed);parse(rfqSchema,rfq);const {quote:q,terms}=signed;
 const equal=(ok:boolean,field:string)=>{if(!ok)throw new Error(`Quote mismatch: ${field}`);};
 equal(signed.vendorId===vendor.id,'vendor');equal(sameAddress(q.vendorSigner,vendor.signer),'signer');equal(sameAddress(q.payee,vendor.payee),'payee');equal(sameAddress(q.buyer,rfq.buyer),'buyer');equal(sameAddress(q.token,rfq.token)&&sameAddress(q.token,deployment.token),'token');
 equal(rfq.deploymentId===deployment.id&&rfq.chainId===deployment.chainId,'deployment');equal(q.rfqId===rfq.rfqId&&q.rfqHash===hash(rfq),'request');equal(q.inputHash===rfq.inputHash&&q.skuHash===hash(rfq.sku),'service');
 equal(q.termsHash===hash(terms)&&terms.inputHash===rfq.inputHash&&terms.sku===rfq.sku,'terms');equal(terms.deliveryWithinSeconds<=rfq.maxDeliverySeconds,'delivery');equal(BigInt(q.amountBaseUnits)<=BigInt(rfq.maxAmountBaseUnits)&&BigInt(q.amountBaseUnits)<=2n**256n-1n,'budget');
 equal(q.issuedAt<=at+30&&q.issuedAt>=rfq.createdAt-30&&q.validUntil-q.issuedAt<=900&&q.validUntil>=at+headroom,'expiry');
 equal(await verifyTypedData({...quotePayload(q),address:vendor.signer,signature:signed.signature as Hex}),'signature');return quoteDigest(q);
}
export function compareConditions(original:SignedQuote,received:SignedQuote):string[]{parse(signedQuoteSchema,received);return [...Object.keys(original.quote).filter(k=>hash(original.quote[k as keyof Quote])!==hash(received.quote[k as keyof Quote])),...(hash(original.terms)!==hash(received.terms)?['terms']:[]),...(original.signature!==received.signature?['signature']:[]),...(original.vendorId!==received.vendorId?['vendorId']:[])];}
export const rankQuotes=(quotes:SignedQuote[])=>[...quotes].sort((a,b)=>{const x=BigInt(a.quote.amountBaseUnits),y=BigInt(b.quote.amountBaseUnits);if(x!==y)return x<y?-1:1;const d=a.terms.deliveryWithinSeconds-b.terms.deliveryWithinSeconds;if(d)return d;return a.quote.vendorSigner.toLowerCase()<b.quote.vendorSigner.toLowerCase()?-1:a.quote.vendorSigner.toLowerCase()>b.quote.vendorSigner.toLowerCase()?1:quoteDigest(a.quote)<quoteDigest(b.quote)?-1:1;});

export type PreparedPayment={attemptId:Hex;rfqId:Hex;quoteDigest:Hex;conditionsDigest:Hex;deploymentId:Hex;chainId:133;providerProfile:'local';payer:Hex;payee:Hex;token:Hex;recipientAmountBaseUnits:string;payerMaxDebitBaseUnits:string;maxNativeGasWei:'0';validUntil:number;policyVersion:1};
export const approvalDigest=(p:PreparedPayment)=>hash(p);
export const paymentTypes={LocalPayment:[{name:'attemptId',type:'bytes32'},{name:'approvalDigest',type:'bytes32'},{name:'quoteDigest',type:'bytes32'},{name:'payer',type:'address'},{name:'payee',type:'address'},{name:'token',type:'address'},{name:'amount',type:'uint256'},{name:'validUntil',type:'uint64'}]} as const;
export const paymentPayload=(p:PreparedPayment)=>({domain:{name:'ProofBidLocalPayment',version:'1',chainId:deployment.chainId,salt:deployment.id},types:paymentTypes,primaryType:'LocalPayment' as const,message:{attemptId:p.attemptId,approvalDigest:approvalDigest(p),quoteDigest:p.quoteDigest,payer:p.payer,payee:p.payee,token:p.token,amount:BigInt(p.recipientAmountBaseUnits),validUntil:BigInt(p.validUntil)}});
export function preparePayment(rfq:Rfq,signed:SignedQuote):PreparedPayment{return {attemptId:newId(),rfqId:rfq.rfqId as Hex,quoteDigest:quoteDigest(signed.quote),conditionsDigest:hash(signed),deploymentId:deployment.id,chainId:133,providerProfile:'local',payer:getAddress(rfq.buyer),payee:getAddress(signed.quote.payee),token:getAddress(signed.quote.token),recipientAmountBaseUnits:signed.quote.amountBaseUnits,payerMaxDebitBaseUnits:signed.quote.amountBaseUnits,maxNativeGasWei:'0',validUntil:signed.quote.validUntil,policyVersion:1};}
export type Settlement={mode:'local';attemptId:Hex;quoteDigest:Hex;payer:Hex;payee:Hex;token:Hex;amountBaseUnits:string;settledAt:number;receiptId:string};
export function verifySettlement(p:PreparedPayment,s:Settlement){if(s.mode!=='local'||s.attemptId!==p.attemptId||s.quoteDigest!==p.quoteDigest||!sameAddress(s.payer,p.payer)||!sameAddress(s.payee,p.payee)||!sameAddress(s.token,p.token)||s.amountBaseUnits!==p.recipientAmountBaseUnits||s.receiptId!==`local:${p.attemptId}`||!Number.isSafeInteger(s.settledAt)||s.settledAt<1)throw new Error('Settlement evidence mismatch');}
export type Delivery={report:Report;attemptId:Hex;quoteDigest:Hex;artifactHash:Hex;signature:Hex;deliveredAt:number};
export const deliveryPayload=(d:Omit<Delivery,'signature'>)=>({domain:{name:'ProofBidDelivery',version:'1',chainId:133,salt:deployment.id},types:{Delivery:[{name:'attemptId',type:'bytes32'},{name:'quoteDigest',type:'bytes32'},{name:'artifactHash',type:'bytes32'},{name:'inputHash',type:'bytes32'},{name:'analyzerVersionHash',type:'bytes32'},{name:'deliveredAt',type:'uint64'}]},primaryType:'Delivery' as const,message:{attemptId:d.attemptId,quoteDigest:d.quoteDigest,artifactHash:d.artifactHash,inputHash:d.report.inputHash,analyzerVersionHash:hash(d.report.analyzerVersion),deliveredAt:BigInt(d.deliveredAt)}});
export async function verifyDelivery(d:Delivery,p:PreparedPayment,signed:SignedQuote,fixture:keyof typeof fixtures){if(d.attemptId!==p.attemptId||d.quoteDigest!==p.quoteDigest||d.artifactHash!==hash(d.report)||hash(d.report)!==hash(analyze(fixture))||!await verifyTypedData({...deliveryPayload(d),address:signed.quote.vendorSigner as Hex,signature:d.signature}))throw new Error('Delivery verification failed');}
export type {Run,RunState,Offer,PublicRun} from './run.js';
export {publicRun} from './run.js';
