/* Authorities are a DHIS2 concept: they are translated here into the capabilities that the rest
   of the app uses, so that no other layer has to know which authority grants what. */

export const documentUploadAuthorities = ["ALL", "F_DOCUMENT_PRIVATE_ADD"] as const;

export function canUploadDocuments(authorities: ReadonlySet<string>): boolean {
    return documentUploadAuthorities.some(authority => authorities.has(authority));
}
