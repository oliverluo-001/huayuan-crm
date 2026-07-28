export interface CreateAuditDto {
  username: string;
  action: string;
  details?: string;
}
