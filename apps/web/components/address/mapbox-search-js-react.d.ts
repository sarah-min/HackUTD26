declare module '@mapbox/search-js-react' {
  import type { ReactNode, FC } from 'react';

  export type AddressAutofillRetrieveResponse = {
    features: Array<{
      geometry?: { type: string; coordinates?: [number, number] };
      properties?: Record<string, unknown>;
    }>;
  };

  export const AddressAutofill: FC<{
    accessToken: string;
    options?: { country?: string; language?: string; limit?: number };
    onRetrieve?: (res: AddressAutofillRetrieveResponse) => void;
    onSuggestError?: (error: Error) => void;
    children?: ReactNode;
  }>;
}
