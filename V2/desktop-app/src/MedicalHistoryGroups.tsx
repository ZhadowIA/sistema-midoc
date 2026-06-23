import type { MedicalHistoryGroup } from "./medicalHistoryFormat";

export function MedicalHistoryGroups({ groups }: { groups: MedicalHistoryGroup[] }) {
  return (
    <div className="clinical-response-groups medical-history-groups">
      {groups.map((group) => (
        <section key={group.key} className="clinical-response-group medical-history-group">
          <div className="clinical-response-heading">
            <h4>{group.title}</h4>
            <span>
              {group.rows.length} {group.rows.length === 1 ? "respuesta" : "respuestas"}
            </span>
          </div>
          <dl className="clinical-field-list">
            {group.rows.map((row) => (
              <div key={`${group.key}-${row.label}`} className="clinical-field-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
