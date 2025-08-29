import { FormControl } from "@angular/forms";

// Tipado de los controles del form:
export type SurveyControls = {
  facilidad: FormControl<number | null>;
  termino: FormControl<boolean | null>;
  csat: FormControl<number | null>;
  comentario: FormControl<string | null>;
};
