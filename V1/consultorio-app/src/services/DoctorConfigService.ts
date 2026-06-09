import prisma from '../lib/prisma'

export class DoctorConfigService {
  static async getConfig(doctorId: string) {
    return prisma.doctorConfig.findUnique({
      where: { doctorId }
    })
  }

  static async updateConfig(doctorId: string, data: {
    consultationDurationMin?: number;
    extendedConsultationEnabled?: boolean;
    normalConsultationPrice?: number;
    extendedConsultationPrice?: number;
  }) {
    return prisma.doctorConfig.update({
      where: { doctorId },
      data
    })
  }
}
