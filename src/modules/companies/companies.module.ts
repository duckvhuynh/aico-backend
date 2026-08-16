import { Module } from '@nestjs/common';
import { GovernanceModule } from '../governance/governance.module';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyProfilePolicy } from './company-profile.policy';

@Module({
  imports: [GovernanceModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyProfilePolicy],
  exports: [CompaniesService, CompanyProfilePolicy],
})
export class CompaniesModule {}
