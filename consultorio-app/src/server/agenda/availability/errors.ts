export class AvailabilityInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AvailabilityInputError'
  }
}

export class AvailabilityConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AvailabilityConflictError'
  }
}

export class AvailabilityNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AvailabilityNotFoundError'
  }
}
