declare module "shapefile" {
  interface Source {
    read(): Promise<{ done: boolean; value: any }>;
  }
  export function open(shp: string, dbf?: string, options?: any): Promise<Source>;
}
