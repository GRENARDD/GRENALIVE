// GREÑA: protocolo oficial YouTube liveChatMessages.streamList (gRPC).
// Un canal persistente por LIVE, sin sondeos de chat cada cinco segundos.
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const root=dirname(fileURLToPath(import.meta.url));
const definition=protoLoader.loadSync(join(root,'youtube-live-stream.proto'),{
  keepCase:false,longs:String,enums:String,defaults:false,oneofs:true
});
const service=grpc.loadPackageDefinition(definition).youtube.api.v3.V3DataLiveChatMessageService;
const types={
  TEXT_MESSAGE_EVENT:'textMessageEvent',SUPER_CHAT_EVENT:'superChatEvent',
  SUPER_STICKER_EVENT:'superStickerEvent',NEW_SPONSOR_EVENT:'newSponsorEvent',
  MEMBER_MILESTONE_CHAT_EVENT:'memberMilestoneChatEvent',
  MEMBERSHIP_GIFTING_EVENT:'membershipGiftingEvent',
  GIFT_MEMBERSHIP_RECEIVED_EVENT:'giftMembershipReceivedEvent',
  GIFT_EVENT:'giftEvent'
};
export function normalizeGrpcLiveChatItem(item={}){
  const s=item.snippet||{},a=item.authorDetails||{};
  return {
    id:item.id||'',
    authorDetails:{
      channelId:a.channelId||'',displayName:a.displayName||'',
      profileImageUrl:a.profileImageUrl||'',isChatOwner:!!a.isChatOwner,
      isChatSponsor:!!a.isChatSponsor,isChatModerator:!!a.isChatModerator
    },
    snippet:{
      type:types[s.type]||'',publishedAt:s.publishedAt||'',
      displayMessage:s.displayMessage||'',textMessageDetails:s.textMessageDetails,
      superChatDetails:s.superChatDetails,superStickerDetails:s.superStickerDetails,
      newSponsorDetails:s.newSponsorDetails,memberMilestoneChatDetails:s.memberMilestoneChatDetails,
      membershipGiftingDetails:s.membershipGiftingDetails,
      giftMembershipReceivedDetails:s.giftMembershipReceivedDetails,
      giftDetails:s.giftDetails
    }
  };
}
export function openYouTubeLiveStream({token,chatId,pageToken='',onBatch,onError,onEnd}={}){
  if(!token||!chatId)throw Error('Faltan la sesión OAuth o el ID del chat YouTube.');
  const client=new service('youtube.googleapis.com:443',grpc.credentials.createSsl(),
    {'grpc.keepalive_time_ms':60000,'grpc.keepalive_timeout_ms':15000});
  const metadata=new grpc.Metadata();
  metadata.set('authorization','Bearer '+token);
  const stream=client.StreamList({
    liveChatId:chatId,part:['id','snippet','authorDetails'],
    ...(pageToken?{pageToken}: {})
  },metadata);
  let finished=false,cancelled=false;
  function close(){if(finished)return;finished=true;client.close()}
  stream.on('data',batch=>{
    if(finished)return;
    try{onBatch?.({nextPageToken:batch.nextPageToken||'',
      offlineAt:batch.offlineAt||'',
      items:(batch.items||[]).map(normalizeGrpcLiveChatItem)})}
    catch(e){onError?.(e)}
  });
  stream.on('error',e=>{if(cancelled)return;close();onError?.(e)});
  stream.on('end',()=>{if(cancelled)return;close();onEnd?.()});
  return {cancel(){cancelled=true;try{stream.cancel()}catch{}close()}};
}
