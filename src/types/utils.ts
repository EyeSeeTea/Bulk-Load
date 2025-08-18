export type NonNullableValues<Obj> = { [K in keyof Obj]: NonNullable<Obj[K]> };

export type Maybe<T> = T | undefined;

export type Dictionary<T> = Record<string, T>;

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type GetArrayInnerType<T extends readonly any[]> = T[number];

export type NonEmptyArray<T> = T[] & { 0: T };

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
    {
        [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
    }[Keys];

export function isValueInUnionType<S, T extends S>(value: S, values: readonly T[]): value is T {
    return (values as readonly S[]).indexOf(value) >= 0;
}

export function buildObject<Value>() {
    return <T extends {}>(object: { [K in keyof T]: Value }) => object;
}

export function isNotEmpty<T>(xs: T[] | undefined): xs is NonEmptyArray<T> {
    return xs ? xs.length > 0 : false;
}

export type KeysOfUnion<T> = T extends T ? keyof T : never;

export function ofType<T>(obj: T): T {
    return obj;
}

export function firstOrFail<T>(xs: T[]) {
    const x = xs[0];
    if (x === undefined) {
        throw new Error();
    } else {
        return x;
    }
}

export function assertUnreachable(_value: never): never {
    throw new Error();
}

export type OkOrError = { status: true } | { status: false; error: string };

export type RecursivePartial<T> = {
    [P in keyof T]?: T[P] extends (infer U)[]
        ? RecursivePartial<U>[]
        : T[P] extends object
        ? RecursivePartial<T[P]>
        : T[P];
};

type PrevDepth = [never, 0, 1, 2, 3, 4, 5];
type UnwrapMaybe<T> = T extends Maybe<infer U> ? U : T;
export type NestedKeyOf<T, Prefix extends string = "", Depth extends number = 5> = Depth extends 0
    ? never
    : T extends object
    ? {
          [K in keyof T & string]: UnwrapMaybe<T[K]> extends readonly any[] // ignore arrays. Add specific handling if needed
              ? never
              : UnwrapMaybe<T[K]> extends object
              ? `${Prefix}${K}` | NestedKeyOf<UnwrapMaybe<T[K]>, `${Prefix}${K}.`, PrevDepth[Depth]>
              : `${Prefix}${K}`;
      }[keyof T & string]
    : never;
