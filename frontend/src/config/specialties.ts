export const SPECIALTIES = [
  {
    id: "FAMILY_MEDICINE",
    name: "Medicina Familiar / General",
    icon: "🏥",
    description: "Atención primaria y cuidados generales",
  },
  {
    id: "PEDIATRICS",
    name: "Pediatría",
    icon: "👶",
    description: "Medicina infantil y neonatal",
  },
  {
    id: "GYNECOLOGY_OBSTETRICS",
    name: "Ginecología y Obstetricia",
    icon: "👩‍⚕️",
    description: "Salud reproductiva y maternidad",
  },
  {
    id: "DERMATOLOGY",
    name: "Dermatología",
    icon: "🔬",
    description: "Enfermedades de la piel",
  },
  {
    id: "CARDIOLOGY",
    name: "Cardiología",
    icon: "❤️",
    description: "Enfermedades del corazón",
  },
  {
    id: "MENTAL_HEALTH",
    name: "Psiquiatría y Salud Mental",
    icon: "🧠",
    description: "Salud mental y psicológica",
  },
  {
    id: "DENTISTRY",
    name: "Odontología",
    icon: "🦷",
    description: "Cuidado dental y bucal",
  },
  {
    id: "OPHTHALMOLOGY",
    name: "Oftalmología",
    icon: "👁️",
    description: "Enfermedades de los ojos",
  },
];

export function getSpecialtyName(id: string): string {
  return SPECIALTIES.find((s) => s.id === id)?.name ?? id;
}

export function getSpecialtyIcon(id: string): string {
  return SPECIALTIES.find((s) => s.id === id)?.icon ?? "🏥";
}
