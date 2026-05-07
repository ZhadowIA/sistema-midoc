import { expect, test } from "@playwright/test";

test.describe("Semana 3 · Journeys críticos", () => {
  test("directorio paciente -> perfil medico -> seleccion de horario", async ({ page }) => {
    await page.route("**/api/agenda/public/doctors", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "doc_1", name: "Dra. Demo", specialty: "Cardiología", slug: "dra-demo" },
        ]),
      });
    });

    await page.route("**/api/public/doctor/dra-demo", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "doc_1",
          name: "Dra. Demo",
          specialty: "Cardiología",
          bio: "Atención integral.",
          profileImage: null,
          phone: null,
          professionalLicense: "ABC123",
          consultationDurationMin: 30,
          normalConsultationPrice: 900,
          extendedConsultationPrice: null,
          services: [{ id: "svc_1", name: "Consulta normal", description: null, price: 900 }],
        }),
      });
    });

    await page.route("**/api/public/doctor/doc_1/availability?**", async (route) => {
      const from = new URL(route.request().url()).searchParams.get("from") ?? "2026-05-01";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { date: from, slots: [{ startTime: "10:00", endTime: "10:30", isAvailable: true }] },
          { date: "2026-05-02", slots: [] },
          { date: "2026-05-03", slots: [] },
          { date: "2026-05-04", slots: [] },
          { date: "2026-05-05", slots: [] },
          { date: "2026-05-06", slots: [] },
          { date: "2026-05-07", slots: [] },
        ]),
      });
    });

    await page.goto("/paciente");
    await page.getByRole("link", { name: "Dra. Demo" }).click();
    await expect(page).toHaveURL(/\/doctor\/dra-demo/);
    await expect(page.getByRole("heading", { name: "Horarios disponibles" })).toBeVisible();
    await page.getByRole("button", { name: "10:00" }).first().click();
    await expect(page.getByText("Tu cita")).toBeVisible();
  });

  test("login paciente respeta returnTo", async ({ page }) => {
    await page.route("**/api/auth/patient/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, user: { id: "p1", role: "PATIENT" } }),
      });
    });

    await page.goto("/paciente/login?returnTo=/paciente/cuenta");
    await page.getByLabel("Correo electrónico").fill("paciente@demo.com");
    await page.getByLabel("Contraseña").fill("secreto123");
    await page.getByRole("button", { name: "Iniciar Sesión" }).click();
    await expect(page).toHaveURL(/\/paciente\/cuenta/);
  });

  test("directorio muestra perfil incompleto cuando falta slug", async ({ page }) => {
    await page.route("**/api/agenda/public/doctors", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "doc_1", name: "Dra. Visible", specialty: "Pediatría", slug: "dra-visible" },
          { id: "doc_2", name: "Dr. Incompleto", specialty: "Dermatología", slug: null },
        ]),
      });
    });

    await page.goto("/paciente");
    await expect(page.getByRole("link", { name: "Dra. Visible" })).toHaveAttribute("href", "/doctor/dra-visible");
    await expect(page.getByText("Dr. Incompleto")).toBeVisible();
    await expect(page.getByText("Perfil público incompleto (sin URL personalizada).")).toBeVisible();
  });

  test("configuracion medico muestra estado de URL publica", async ({ page }) => {
    await page.route("**/api/admin/profile", async (route) => {
      if (route.request().method() === "PUT") {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "doc_1",
            ...payload,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "doc_1",
          name: "Dra. Demo",
          specialty: "CARDIOLOGY",
          bio: "",
          slug: "",
          profileImage: "",
          professionalLicense: "",
          clinicAddress: "",
          logoImage: "",
        }),
      });
    });

    await page.route("**/api/admin/config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ doctorId: "doc_1", consultationDurationMin: 30 }),
      });
    });

    await page.route("**/api/agenda/admin/dashboard/summary", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupChecklist: null }),
      });
    });

    await page.route("**/api/admin/services", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ services: [] }),
      });
    });

    await page.goto("/medico/configuracion?tab=perfil");
    await expect(page.getByText("Perfil público incompleto: sin URL personalizada")).toBeVisible();

    const slugInput = page.getByPlaceholder("dra-maria-gonzalez");
    await slugInput.fill("dra-demo");
    await page.getByRole("button", { name: "Guardar perfil" }).click();
    await expect(page.getByText("Perfil público activo en:")).toBeVisible();
  });
});
