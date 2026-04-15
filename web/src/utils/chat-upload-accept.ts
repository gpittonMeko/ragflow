/**
 * Estensioni allineate a `api/utils/file_utils.filename_type` (upload_and_parse).
 * Usate per `accept` sul file picker e validazione client prima dell’upload.
 */
const DOC_EXT =
  'eml,doc,docx,ppt,pptx,yml,xml,htm,json,csv,txt,ini,xls,xlsx,wps,rtf,hlp,pages,numbers,key,md,py,js,java,c,cpp,h,php,go,ts,sh,cs,kt,html,sql'.split(
    ',',
  );
const AURAL_EXT = 'wav,flac,ape,alac,wavpack,wv,mp3,aac,ogg,vorbis,opus'.split(
  ',',
);
const VISUAL_EXT =
  'jpg,jpeg,png,tif,gif,pcx,tga,exif,fpx,svg,psd,cdr,pcd,dxf,ufo,eps,ai,raw,webp,apng,icon,ico,mpg,mpeg,avi,rm,rmvb,mov,wmv,asf,dat,asx,wvx,mpe,mpa,mp4'.split(
    ',',
  );

const ALL_EXT = ['pdf', ...DOC_EXT, ...AURAL_EXT, ...VISUAL_EXT];

export const CHAT_UPLOAD_ACCEPT = ALL_EXT.map((e) => `.${e}`).join(',');

export function isAllowedChatUploadFilename(name: string): boolean {
  const fn = String(name ?? '').toLowerCase();
  if (!fn.includes('.')) return false;
  return ALL_EXT.some((ext) => fn.endsWith(`.${ext}`));
}
