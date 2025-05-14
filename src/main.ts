import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { CoreModule } from './core.module'
import { bootstrap } from './index'

@Module({ imports: [CoreModule.forRootAsync()] })
export class AppModule {}
NestFactory.create<NestExpressApplication>(AppModule).then(m => {
	bootstrap(m, {
		port: 8888,
		appName: 'TEST',
	}).then()
})
