/** Domain error with an HTTP status the transport layer can map directly. */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}
