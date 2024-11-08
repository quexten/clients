import {
  CollectionAdminView,
  CollectionView,
  NestingDelimiter,
} from "@bitwarden/admin-console/common";
import { TreeNode } from "@bitwarden/common/vault/models/domain/tree-node";
import { ServiceUtils } from "@bitwarden/common/vault/service-utils";

export function getNestedCollectionTree(
  collections: CollectionAdminView[],
): TreeNode<CollectionAdminView>[];
export function getNestedCollectionTree(collections: CollectionView[]): TreeNode<CollectionView>[];
export function getNestedCollectionTree(
  collections: (CollectionView | CollectionAdminView)[],
): TreeNode<CollectionView | CollectionAdminView>[] {
  if (!collections) {
    return [];
  }

  // Collections need to be cloned because ServiceUtils.nestedTraverse actively
  // modifies the names of collections.
  // These changes risk affecting collections store in StateService.
  const clonedCollections = collections
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(cloneCollection);

  const nodes: TreeNode<CollectionView | CollectionAdminView>[] = [];
  clonedCollections.forEach((collection) => {
    const parts =
      collection.name != null
        ? collection.name.replace(/^\/+|\/+$/g, "").split(NestingDelimiter)
        : [];
    ServiceUtils.nestedTraverse(nodes, 0, parts, collection, null, NestingDelimiter);
  });
  return nodes;
}

function cloneCollection(collection: CollectionView): CollectionView;
function cloneCollection(collection: CollectionAdminView): CollectionAdminView;
function cloneCollection(
  collection: CollectionView | CollectionAdminView,
): CollectionView | CollectionAdminView {
  let cloned;

  if (collection instanceof CollectionAdminView) {
    cloned = new CollectionAdminView();
    cloned.groups = [...collection.groups];
    cloned.users = [...collection.users];
    cloned.assigned = collection.assigned;
    cloned.unmanaged = collection.unmanaged;
  } else {
    cloned = new CollectionView();
  }

  cloned.id = collection.id;
  cloned.externalId = collection.externalId;
  cloned.hidePasswords = collection.hidePasswords;
  cloned.name = collection.name;
  cloned.organizationId = collection.organizationId;
  cloned.readOnly = collection.readOnly;
  cloned.manage = collection.manage;
  return cloned;
}
