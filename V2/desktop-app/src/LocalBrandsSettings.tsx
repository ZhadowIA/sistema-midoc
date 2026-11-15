import { useEffect, useState } from "react";
import { call } from "./ipc";
import type { LocalBrand } from "./brandsModel";
import { brandSummary } from "./brandsModel";

/**
 * Marcas que el medico agrego desde la receta (paso 33, etapa 3). Viven solo en
 * esta computadora; aqui se revisan y se borran.
 */
export function LocalBrandsSettings() {
  const [brands, setBrands] = useState<LocalBrand[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setBrands(await call<LocalBrand[]>("list_local_brands"));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(brand: LocalBrand) {
    setBusy(true);
    setError("");
    try {
      await call("delete_local_brand", { id: brand.id });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Mis marcas</h2>
        <p>
          Medicamentos que me dijiste qué contienen desde la receta. Se guardan solo en esta computadora y sirven
          para reconocerlos en tus recetas.
        </p>
      </div>
      {brands === null ? null : brands.length === 0 ? (
        <p className="meta">Aún no has agregado ninguna. Cuando escribas uno que no reconozca, te lo preguntaré.</p>
      ) : (
        <div className="stack">
          {brands.map((brand) => (
            <div key={brand.id} className="button-row">
              <span>{brandSummary(brand)}</span>
              <button className="ghost-button" onClick={() => void remove(brand)} disabled={busy}>
                Borrar
              </button>
            </div>
          ))}
        </div>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
