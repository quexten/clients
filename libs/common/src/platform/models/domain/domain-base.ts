import { ConditionalExcept, ConditionalKeys, Constructor } from "type-fest";

import { View } from "../../../models/view/view";
import { EncryptService } from "../../abstractions/encrypt.service";

import { EncString } from "./enc-string";
import { SymmetricCryptoKey } from "./symmetric-crypto-key";

// eslint-disable-next-line @typescript-eslint/ban-types
type EncStringKeys<T> = ConditionalKeys<ConditionalExcept<T, Function>, EncString>;
export type DecryptedObject<
  TEncryptedObject,
  TDecryptedKeys extends EncStringKeys<TEncryptedObject>,
> = Record<TDecryptedKeys, string> & Omit<TEncryptedObject, TDecryptedKeys>;

// https://contributing.bitwarden.com/architecture/clients/data-model#domain
export default class Domain {
  protected buildDomainModel<D extends Domain>(
    domain: D,
    dataObj: any,
    map: any,
    notEncList: any[] = [],
  ) {
    for (const prop in map) {
      // eslint-disable-next-line
      if (!map.hasOwnProperty(prop)) {
        continue;
      }

      const objProp = dataObj[map[prop] || prop];
      if (notEncList.indexOf(prop) > -1) {
        (domain as any)[prop] = objProp ? objProp : null;
      } else {
        (domain as any)[prop] = objProp ? new EncString(objProp) : null;
      }
    }
  }
  protected buildDataModel<D extends Domain>(
    domain: D,
    dataObj: any,
    map: any,
    notEncStringList: any[] = [],
  ) {
    for (const prop in map) {
      // eslint-disable-next-line
      if (!map.hasOwnProperty(prop)) {
        continue;
      }

      const objProp = (domain as any)[map[prop] || prop];
      if (notEncStringList.indexOf(prop) > -1) {
        (dataObj as any)[prop] = objProp != null ? objProp : null;
      } else {
        (dataObj as any)[prop] = objProp != null ? (objProp as EncString).encryptedString : null;
      }
    }
  }

  protected async decryptObj<T extends View>(
    viewModel: T,
    map: any,
    orgId: string,
    key: SymmetricCryptoKey = null,
  ): Promise<T> {
    const promises = [];
    const self: any = this;

    for (const prop in map) {
      // eslint-disable-next-line
      if (!map.hasOwnProperty(prop)) {
        continue;
      }

      (function (theProp) {
        const p = Promise.resolve()
          .then(() => {
            const mapProp = map[theProp] || theProp;
            if (self[mapProp]) {
              return self[mapProp].decrypt(orgId, key);
            }
            return null;
          })
          .then((val: any) => {
            (viewModel as any)[theProp] = val;
          });
        promises.push(p);
      })(prop);
    }

    await Promise.all(promises);
    return viewModel;
  }

  /**
   * Decrypts the requested properties of the domain object with the provided key and encrypt service.
   *
   * If a property is null, the result will be null.
   * @see {@link EncString.decryptWithKey} for more details on decryption behavior.
   *
   * @param encryptedProperties The properties to decrypt. Type restricted to EncString properties of the domain object.
   * @param key The key to use for decryption.
   * @param encryptService The encryption service to use for decryption.
   * @param _ The constructor of the domain object. Used for type inference if the domain object is not automatically inferred.
   * @returns An object with the requested properties decrypted and the rest of the domain object untouched.
   */
  protected async decryptObjWithKey<
    TThis extends Domain,
    const TEncryptedKeys extends EncStringKeys<TThis>,
  >(
    this: TThis,
    encryptedProperties: TEncryptedKeys[],
    key: SymmetricCryptoKey,
    encryptService: EncryptService,
    _: Constructor<TThis> = this.constructor as Constructor<TThis>,
  ): Promise<DecryptedObject<TThis, TEncryptedKeys>> {
    const promises = [];

    for (const prop of encryptedProperties) {
      const value = (this as any)[prop] as EncString;
      promises.push(this.decryptProperty(prop, value, key, encryptService));
    }

    const decryptedObjects = await Promise.all(promises);
    const decryptedObject = decryptedObjects.reduce(
      (acc, obj) => {
        return { ...acc, ...obj };
      },
      { ...this },
    );
    return decryptedObject as DecryptedObject<TThis, TEncryptedKeys>;
  }

  private async decryptProperty<const TEncryptedKeys extends EncStringKeys<this>>(
    propertyKey: TEncryptedKeys,
    value: EncString,
    key: SymmetricCryptoKey,
    encryptService: EncryptService,
  ) {
    let decrypted: string = null;
    if (value) {
      decrypted = await value.decryptWithKey(key, encryptService);
    } else {
      decrypted = null;
    }
    return {
      [propertyKey]: decrypted,
    };
  }
}
