import { createContext, useContext } from 'react';

/** The Haul's edition ink for what a page sets in it (quotation marks, the extract's rule, link underlines). */
export const EditionInk = createContext<string | undefined>(undefined);
export const useEditionInk = () => useContext(EditionInk);
