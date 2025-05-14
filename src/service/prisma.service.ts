import {
	Inject,
	Injectable,
	Logger,
	OnApplicationShutdown,
	OnModuleInit,
	Optional,
} from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import {
	ADMIN_USERNAME,
	ADMIN_USER_ID,
	MODULE_OPTIONS_PROVIDER,
	ModuleOptions,
	PERMISSIONS,
	PermissionObj,
	SETTING,
	SYS_USERNAME,
	SYS_USER_ID,
	SettingBody,
	createPassword,
	defaultRoles,
	defaultSettings,
	encrypt,
	env,
	sequential,
	token12,
} from '../common'

@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit, OnApplicationShutdown
{
	constructor(
		@Optional()
		@Inject(MODULE_OPTIONS_PROVIDER)
		private readonly options: ModuleOptions,
	) {
		super()
	}
	private readonly logger = new Logger(PrismaService.name)

	async onApplicationShutdown() {
		await this.$disconnect()
		this.logger.log('Application shutdown, database disconnected!')
	}
	async onModuleInit(): Promise<void> {
		try {
			await this.$connect()
			this.logger.log('✅ Connected to database server')
		} catch (e) {
			this.logger.log('❌ Can not connect to database server')
			return
		}
		if (env.INSTANCE_ID === 0) {
			this.logger.log('Seeding...')
			await this.seedRoles()
			await this.seedPermissions()
			await this.seedUser()
			await this.seedSettings()
			this.logger.log('✅ Seed completed')
		}
	}

	private async seedRoles(): Promise<void> {
		await sequential(
			Object.values(defaultRoles),
			async role =>
				await this.role.upsert({
					where: { title: role.title },
					create: role,
					update: {
						description: role.description,
						id: role.id,
					},
					select: { id: true },
				}),
		)
	}

	private async upsertSetting(
		settings: [string, SettingBody][],
	): Promise<void> {
		await sequential(settings, ([key, setting]) =>
			this.setting.upsert({
				where: { key },
				update: {
					type: setting.type,
					isSecret: setting.isSecret,
					description: setting.description,
				},
				create: {
					id: token12(),
					key,
					value:
						setting.isSecret && setting.value
							? encrypt(setting.value)
							: setting.value,
					type: setting.type,
					description: setting.description,
					isSecret: setting.isSecret,
				},
			}),
		)
	}

	protected async seedSettings(): Promise<void> {
		try {
			const { appSetting, appDefaultSettings } = this.options || {}
			if (appSetting) {
				await this.setting.deleteMany({
					where: {
						key: {
							notIn: Object.values(appSetting).concat(Object.values(SETTING)),
						},
					},
				})
			}
			await this.upsertSetting(Object.entries(defaultSettings))
			if (appSetting && appDefaultSettings) {
				await this.upsertSetting(
					Object.entries<SettingBody>(appDefaultSettings),
				)
			}
			this.logger.log('Seed settings successfully')
		} catch (error) {
			this.logger.error('Error seeding settings:', error)
			throw error
		}
	}

	protected async seedPermissions(): Promise<void> {
		try {
			const { appPermissions } = this.options || {}
			let allPermissionTitles = [
				...Object.entries(PERMISSIONS).flatMap(([module, actions]) =>
					Object.keys(actions).map(action => `${module}.${action}`),
				),
			]

			if (appPermissions) {
				allPermissionTitles = [
					...allPermissionTitles,
					...Object.entries(appPermissions).flatMap(([module, actions]) =>
						Object.keys(actions).map(action => `${module}.${action}`),
					),
				]
				await this.permission.deleteMany({
					where: { title: { notIn: allPermissionTitles } },
				})
			}

			await this.permission.createMany({
				data: allPermissionTitles.map(title => ({
					id: token12(),
					title,
				})),
				skipDuplicates: true,
			})

			const dbPermissions = await this.permission.findMany({
				select: { title: true, id: true },
			})

			const rolePermissionMappings: Array<{
				id: string
				roleId: string
				permissionId: string
			}> = []

			const permissionsToProcess: PermissionObj[] = [
				PERMISSIONS,
				...(appPermissions ? [appPermissions] : []),
			]
			for (const permissions of permissionsToProcess) {
				for (const [module, actions] of Object.entries(permissions)) {
					for (const [action, { roles }] of Object.entries(actions)) {
						const permission = dbPermissions.find(
							p => p.title === `${module}.${action}`,
						)
						if (permission) {
							for (const roleId of roles) {
								rolePermissionMappings.push({
									id: token12(),
									roleId,
									permissionId: permission.id,
								})
							}
						}
					}
				}
			}

			await this.rolePermission.createMany({
				data: rolePermissionMappings,
				skipDuplicates: true,
			})
			this.logger.log('Seed permissions successfully')
		} catch (error) {
			this.logger.error('Error seeding permissions:', error)
			throw error
		}
	}

	private async seedUser(): Promise<void> {
		try {
			await this.user.upsert({
				where: { username: SYS_USERNAME },
				create: {
					id: SYS_USER_ID,
					username: SYS_USERNAME,
					...(await createPassword(token12())),
				},
				update: {
					id: SYS_USER_ID,
					...(await createPassword(token12())),
				},
				select: { id: true },
			})

			// Upsert admin user
			await this.user.upsert({
				where: { username: ADMIN_USERNAME },
				create: {
					id: ADMIN_USER_ID,
					username: ADMIN_USERNAME,
					...(await createPassword('12345678aA@')),
					roles: {
						create: { roleId: defaultRoles.administrator.id, id: token12() },
					},
				},
				update: {
					roles: {
						createMany: {
							data: [{ roleId: defaultRoles.administrator.id, id: token12() }],
							skipDuplicates: true,
						},
					},
				},
				select: { id: true },
			})
			this.logger.log('Seed users successfully')
		} catch (e) {
			this.logger.error('Error seeding users:', e)
			throw e
		}
	}
}
