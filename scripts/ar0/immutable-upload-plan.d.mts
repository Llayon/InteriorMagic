export interface ImmutableUploadObject { path: string }
export interface ImmutableObjectStatus { path: string; exists: boolean; identical: boolean }
export function planImmutableUpload<T extends ImmutableUploadObject>(objects: T[], statuses: ImmutableObjectStatus[]): T[];
