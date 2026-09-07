export class User {
  public id: string
  public username: string
  public idpUserId: string
  public active: boolean
  public authzChangedAt?: Date | null

  constructor({ id, username, idpUserId, active, authzChangedAt }: User) {
    this.id = id
    this.username = username
    this.idpUserId = idpUserId
    this.active = active
    this.authzChangedAt = authzChangedAt ?? null
  }
}
