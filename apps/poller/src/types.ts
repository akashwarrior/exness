export interface AssetMessage {
  data: {
    E: number,
    T: number,
    a: number,
    b: number,
    e: string,
    m: boolean,
    p: string,
    s: string,
  }
}
  
export interface Msg {
  asset: string,
  price: number,
  decimal: number,
}
