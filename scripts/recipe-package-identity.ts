export const currentDeliveryRevision=4;
export type SourceDelivery={formatVersion:1;deliveryRevision:1}|{formatVersion:2;deliveryRevision:2|3|4};
export function sourceDeliveryFor(formatVersion:unknown,deliveryRevision:unknown):SourceDelivery|undefined {
  if(formatVersion===1&&deliveryRevision===undefined)return {formatVersion:1,deliveryRevision:1};
  if(formatVersion===2&&(deliveryRevision===2||deliveryRevision===3||deliveryRevision===4))return {formatVersion:2,deliveryRevision};
  return;
}
export function sourcePackageFilename(id:string,version:string,deliveryRevision:number):string {
  if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)||!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Invalid source package identity');
  if(deliveryRevision===1)return id+'-'+version+'.zip';
  if(deliveryRevision===2||deliveryRevision===3||deliveryRevision===4)return id+'-'+version+'-source.'+deliveryRevision+'.zip';
  throw new Error('Unsupported source delivery revision');
}
