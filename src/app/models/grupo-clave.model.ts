// interfaces que solo se usan en Dashboard Abasto > Inventario
// y aplican solo a medicamento y material de curacion

export interface GrupoClaveRaw {
  GrupoInsumo: string;  // viene con saltos de línea
  Clave: string;        // CNIS con puntos
  Categoria: string;    // p.ej. "Categoria I. Medicamentos"
}

export interface GrupoClave {
  clave: string;           // CNIS normalizada (misma regla que usas en InventarioService)
  categoria: string;       // limpio
  grupoInsumo: string;     // limpio, sin saltos de línea dobles
}