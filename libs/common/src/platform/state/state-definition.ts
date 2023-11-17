export type StorageLocation = "disk" | "memory";

/**
 * Defines the base location and instruction of where this state is expected to be located.
 */
export class StateDefinition {
  /**
   * Creates a new instance of {@link StateDefinition}, the creation of which is owned by the platform team.
   * @param name The name of the state, this needs to be unique from all other {@link StateDefinition}'s.
   * @param storageLocation The location of where this state should be stored.
   */
  constructor(readonly name: string, readonly storageLocation: StorageLocation) {}
}
