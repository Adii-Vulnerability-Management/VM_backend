import 'dotenv/config';

import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';

import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import mongoose, { ConnectOptions, Model } from 'mongoose';
import { FrameControl, FrameControlSchema } from './frame_controls/entities/frame_control.entity';
import { FrameWork, FrameWorkSchema } from './frame_works/entities/frame_work.entity';
import { UserFramework, UserFrameworkSchema } from './user_frameworks/entities/user_framework.entity';
import { ScfControl, ScfControlSchema } from './scf_controls/entities/scf_control.entity';
import { MappingScfControl, MappingScfControlSchema } from './scf_controls/entities/mapping_scf_control.entity';
import { FrameworknameControlcodes, FrameworknameControlcodesSchema } from './scf_controls/entities/frameworkname_controlcodes.entity';
import { EvidenceRequestList, EvidenceRequestListSchema } from './scf_controls/entities/evidence_request_list.entity';
import { UserEvidenceRequestList, UserEvidenceRequestListSchema } from './user_map_scf_controls/entities/user_evidence_request_list.entity';
import { UserMapScfControl, UserMapScfControlSchema } from './user_map_scf_controls/entities/user_map_scf_control.entity';
import { Tisax, TisaxSchema } from './tisax/entities/tisax.entity';
import { InformationSecurityQuestion, InformationSecurityQuestionSchema } from './tisax/entities/information_security_question.entity';
import { PrototypeProtectionQuestion, PrototypeProtectionQuestionSchema } from './tisax/entities/prototype_protection_question.entity';
import { DataProtectionQuestion, DataProtectionQuestionSchema } from './tisax/entities/data_protection_question.entity';
import { DataProtectionAnswer, DataProtectionAnswerSchema } from './tisax/entities/data-protection-answer.entity';
import { InformationSecurityAnswer, InformationSecurityAnswerSchema } from './tisax/entities/information-security-answers.entity';
import { PrototypeProtectionAnswer, PrototypeProtectionAnswerSchema } from './tisax/entities/prototype-protection-answers.entity';
import { DataProtectionQnA, DataProtectionQnASchema } from './tisax_audit/entities/data-protection-QnA.entity';
import { InformationSecurityQnA, InformationSecurityQnASchema } from './tisax_audit/entities/information-security-QnA.entity';
import { PrototypeProtectionQnA, PrototypeProtectionQnASchema } from './tisax_audit/entities/prototype-protection-QnA.entity';
import { TisaxImport, TisaxImportSchema } from './tisax_audit/entities/tisaximport.entity';
import { ResourceUrlRoute, ResourceUrlRouteSchema } from './resource_url_routes.entity';
import { User, UserSchema } from './users.entity';
import { MappingErlScfControl, MappingErlScfControlSchema } from './scf_controls/entities/mapping_erl_scf_control.entity';
import { V603DataProtectionQuestion, V603DataProtectionQuestionSchema } from './tisax/entities/data_protection_question_v6.0.3.entity';
import { V603InformationSecurityQuestion, V603InformationSecurityQuestionSchema } from './tisax/entities/information_security_question_v6.0.3.entity';
import { V603DataProtectionAnswer, V603DataProtectionAnswerSchema } from './tisax/entities/data-protection-answer-v6.0.3.entity';
import { V603InformationSecurityAnswer, V603InformationSecurityAnswerSchema } from './tisax/entities/information-security-answers-v6.0.3.entity';
import { V603DataProtectionQnA, V603DataProtectionQnASchema } from './tisax_audit/entities/data-protection-v6.0.3-QnA.entity';
import { V603InformationSecurityQnA, V603InformationSecurityQnASchema } from './tisax_audit/entities/information-security-v6.0.3-QnA.entity';
import { RiskAssessment, RiskAssessmentSchema } from './risk-assessment/entities/risk-assessment.entity';
import { Control, ControlSchema } from './risk-assessment/entities/control.entity';
import { AssessmentUtility, AssessmentUtilitySchema } from './risk-assessment/entities/assessmentUtility.entity';
import { TPRMVendor, TPRMVendorSchema } from './tprm/vendor_management/entities/vendor.entity';
import { TPRMVendorAssessmentQnA, TPRMVendorAssessmentQnASchema } from './tprm/vendor_management/entities/vendorAssessmentQnA.entity';
import { TPRMVendorAssessmentResponse, TPRMVendorAssessmentResponseSchema } from './tprm/vendor_management/entities/vendorAssessmentResponse.entity';
import { TPRMVendorQuestionnaire, TPRMVendorQuestionnaireSchema } from './tprm/vendor_management/entities/vendorQuestionnaire.entity';
import { TPRMVendorSchedule, TPRMVendorScheduleSchema } from './tprm/vendor_management/entities/vendorSchedule.entity';
import { EmployeeDetails, EmployeeDetailsSchema } from './employee/entities/employee.entity';
import { EmployeePolicyDetails, EmployeePolicyDetailsSchema } from './employee/entities/policy.entity';
import { TrainingCampaignDetails, TrainingCampaignDetailsSchema } from './employee/entities/training-campaign.entity';
import { PolicyTemplate, PolicyTemplateSchema } from './employee/entities/policyTemplate.entity';
import { PolicyVersionHistory, PolicyVersionHistorySchema } from './employee/entities/policy-version-history.entity';
import { ProcedureTemplate, ProcedureTemplateSchema } from './employee/entities/procedureTemplate.entity';
import { ConfigureDevices, ConfigureDevicesSchema } from './employee/entities/configureDevices.entity';
import { Procedure, ProcedureSchema } from './employee/entities/procedure.entity';
import { ProcedureVersionHistory, ProcedureVersionHistorySchema } from './employee/entities/procedure-version-history.entity';
import { TPRMVendorReport, TPRMVendorReportSchema } from './tprm/vendor_management/entities/vendorReport.entity';
import { TPRMVendorRisk, TPRMVendorRiskSchema } from './tprm/vendor_management/entities/vendorRisk.entity';
import { TPRMClient, TPRMClientSchema } from './tprm/client_management/entities/client.entity';
import { TPRMClientSchedule, TPRMClientScheduleSchema } from './tprm/client_management/entities/clientSchedule.entity';
import { TPRMClientAssessmentQnA, TPRMClientAssessmentQnASchema } from './tprm/client_management/entities/clientAssessmentQnA.entity';
import { TPRMClientAssessmentResponse, TPRMClientAssessmentResponseSchema } from './tprm/client_management/entities/clientAssessmentResponse.entity';

import RedisStore from 'connect-redis';
import { authenticate, redisClient } from './app.module';
import { DataPrivacyFramework, DataPrivacyFrameworkSchema } from './data_privacy_framework/entities/data_privacy_framework.entity';

@Module({
  imports: [
    import('@adminjs/nestjs').then(({ AdminModule }) =>
      AdminModule.createAdminAsync({
        imports: [
          MongooseModule.forFeature([
            { name: ResourceUrlRoute.name, schema: ResourceUrlRouteSchema },
            { name: User.name, schema: UserSchema },
            { name: FrameWork.name, schema: FrameWorkSchema },
            { name: FrameControl.name, schema: FrameControlSchema },
            { name: UserFramework.name, schema: UserFrameworkSchema },
            { name: DataPrivacyFramework.name, schema: DataPrivacyFrameworkSchema },
            { name: ScfControl.name, schema: ScfControlSchema },
            { name: MappingScfControl.name, schema: MappingScfControlSchema },
            { name: MappingErlScfControl.name, schema: MappingErlScfControlSchema },
            { name: FrameworknameControlcodes.name, schema: FrameworknameControlcodesSchema },
            { name: EvidenceRequestList.name, schema: EvidenceRequestListSchema },
            { name: UserMapScfControl.name, schema: UserMapScfControlSchema },
            { name: UserEvidenceRequestList.name, schema: UserEvidenceRequestListSchema },
            { name: Tisax.name, schema: TisaxSchema },
            { name: InformationSecurityQuestion.name, schema: InformationSecurityQuestionSchema },
            { name: V603InformationSecurityQuestion.name, schema: V603InformationSecurityQuestionSchema },
            { name: PrototypeProtectionQuestion.name, schema: PrototypeProtectionQuestionSchema },
            { name: DataProtectionQuestion.name, schema: DataProtectionQuestionSchema },
            { name: V603DataProtectionQuestion.name, schema: V603DataProtectionQuestionSchema },
            { name: InformationSecurityAnswer.name, schema: InformationSecurityAnswerSchema },
            { name: V603InformationSecurityAnswer.name, schema: V603InformationSecurityAnswerSchema },
            { name: PrototypeProtectionAnswer.name, schema: PrototypeProtectionAnswerSchema },
            { name: DataProtectionAnswer.name, schema: DataProtectionAnswerSchema },
            { name: V603DataProtectionAnswer.name, schema: V603DataProtectionAnswerSchema },
            { name: PrototypeProtectionQnA.name, schema: PrototypeProtectionQnASchema },
            { name: InformationSecurityQnA.name, schema: InformationSecurityQnASchema },
            { name: DataProtectionQnA.name, schema: DataProtectionQnASchema },
            { name: V603InformationSecurityQnA.name, schema: V603InformationSecurityQnASchema },
            { name: V603DataProtectionQnA.name, schema: V603DataProtectionQnASchema },
            { name: TisaxImport.name, schema: TisaxImportSchema },
            { name: TPRMVendor.name, schema: TPRMVendorSchema },
            { name: TPRMVendorQuestionnaire.name, schema: TPRMVendorQuestionnaireSchema },
            { name: TPRMVendorSchedule.name, schema: TPRMVendorScheduleSchema },
            { name: TPRMVendorAssessmentQnA.name, schema: TPRMVendorAssessmentQnASchema },
            { name: TPRMVendorAssessmentResponse.name, schema: TPRMVendorAssessmentResponseSchema },
            { name: TPRMVendorRisk.name, schema: TPRMVendorRiskSchema },
            { name: TPRMVendorReport.name, schema: TPRMVendorReportSchema },
            { name: TPRMClient.name, schema: TPRMClientSchema },
            { name: TPRMClientSchedule.name, schema: TPRMClientScheduleSchema },
            { name: TPRMClientAssessmentQnA.name, schema: TPRMClientAssessmentQnASchema },
            { name: TPRMClientAssessmentResponse.name, schema: TPRMClientAssessmentResponseSchema },

            { name: RiskAssessment.name, schema: RiskAssessmentSchema },
            { name: Control.name, schema: ControlSchema },
            { name: AssessmentUtility.name, schema: AssessmentUtilitySchema },
            { name: EmployeeDetails.name, schema: EmployeeDetailsSchema },
            { name: EmployeePolicyDetails.name, schema: EmployeePolicyDetailsSchema },
            { name: TrainingCampaignDetails.name, schema: TrainingCampaignDetailsSchema },
            { name: PolicyTemplate.name, schema: PolicyTemplateSchema },
            { name: PolicyVersionHistory.name, schema: PolicyVersionHistorySchema },
            { name: ConfigureDevices.name, schema: ConfigureDevicesSchema },
            { name: ProcedureTemplate.name, schema: ProcedureTemplateSchema },
            { name: Procedure.name, schema: ProcedureSchema },
            { name: ProcedureVersionHistory.name, schema: ProcedureVersionHistorySchema },
          ]),
        ],
        inject: [
          getModelToken(ResourceUrlRoute.name),
          getModelToken(User.name),
          getModelToken(FrameWork.name),
          getModelToken(FrameControl.name),
          getModelToken(UserFramework.name),
          getModelToken(DataPrivacyFramework.name),
          getModelToken(ScfControl.name),
          getModelToken(MappingScfControl.name),
          getModelToken(MappingErlScfControl.name),
          getModelToken(FrameworknameControlcodes.name),
          getModelToken(EvidenceRequestList.name),
          getModelToken(UserMapScfControl.name),
          getModelToken(UserEvidenceRequestList.name),
          getModelToken(Tisax.name),
          getModelToken(InformationSecurityQuestion.name),
          getModelToken(V603InformationSecurityQuestion.name),
          getModelToken(PrototypeProtectionQuestion.name),
          getModelToken(DataProtectionQuestion.name),
          getModelToken(V603DataProtectionQuestion.name),
          getModelToken(InformationSecurityAnswer.name),
          getModelToken(V603InformationSecurityAnswer.name),
          getModelToken(PrototypeProtectionAnswer.name),
          getModelToken(DataProtectionAnswer.name),
          getModelToken(V603DataProtectionAnswer.name),
          getModelToken(PrototypeProtectionQnA.name),
          getModelToken(InformationSecurityQnA.name),
          getModelToken(DataProtectionQnA.name),
          getModelToken(V603InformationSecurityQnA.name),
          getModelToken(V603DataProtectionQnA.name),
          getModelToken(TisaxImport.name),
          getModelToken(TPRMVendor.name),
          getModelToken(TPRMVendorQuestionnaire.name),
          getModelToken(TPRMVendorSchedule.name),
          getModelToken(TPRMVendorAssessmentQnA.name),
          getModelToken(TPRMVendorAssessmentResponse.name),
          getModelToken(TPRMVendorRisk.name),
          getModelToken(TPRMVendorReport.name),
          getModelToken(TPRMClient.name),
          getModelToken(TPRMClientSchedule.name),
          getModelToken(TPRMClientAssessmentQnA.name),
          getModelToken(TPRMClientAssessmentResponse.name),

          getModelToken(RiskAssessment.name),
          getModelToken(Control.name),
          getModelToken(AssessmentUtility.name),
          getModelToken(EmployeeDetails.name),
          getModelToken(EmployeePolicyDetails.name),
          getModelToken(TrainingCampaignDetails.name),
          getModelToken(PolicyTemplate.name),
          getModelToken(PolicyVersionHistory.name),
          getModelToken(ConfigureDevices.name),
          getModelToken(ProcedureTemplate.name),
          getModelToken(Procedure.name),
          getModelToken(ProcedureVersionHistory.name),

        ],
        useFactory: async (
          resourceUrlRouteModel: Model<ResourceUrlRoute>,
          userModel: Model<User>,
          frameworkModel: Model<FrameWork>,
          framecontrolModel: Model<FrameControl>,
          userframeworkModel: Model<UserFramework>,
          dataPrivacyFrameworkModel: Model<DataPrivacyFramework>,
          scfcontrolModel: Model<ScfControl>,
          mappingscfcontrolModel: Model<MappingScfControl>,
          mappingerlscfcontrolModel: Model<MappingErlScfControl>,
          frameworknamecontrolcodesModel: Model<FrameworknameControlcodes>,
          evidencerequestlistModel: Model<EvidenceRequestList>,
          userMapscfcontrolModel: Model<UserMapScfControl>,
          userevidencerequestlistModel: Model<UserEvidenceRequestList>,
          tisaxModel: Model<Tisax>,
          informationSecurityQuestionModel: Model<InformationSecurityQuestion>,
          v603InformationSecurityQuestionModel: Model<V603InformationSecurityQuestion>,
          prototypeProtectionQuestionModel: Model<PrototypeProtectionQuestion>,
          dataProtectionQuestionModel: Model<DataProtectionQuestion>,
          v603DataProtectionQuestionModel: Model<V603DataProtectionQuestion>,
          informationSecurityAnswerModel: Model<InformationSecurityAnswer>,
          v603InformationSecurityAnswerModel: Model<V603InformationSecurityAnswer>,
          prototypeProtectionAnswerModel: Model<PrototypeProtectionAnswer>,
          dataProtectionAnswerModel: Model<DataProtectionAnswer>,
          v603DataProtectionAnswerModel: Model<V603DataProtectionAnswer>,
          PrototypeProtectionQnAModel: Model<PrototypeProtectionQnA>,
          InformationSecurityQnAModel: Model<InformationSecurityQnA>,
          DataProtectionQnAModel: Model<DataProtectionQnA>,
          v603InformationSecurityQnAModel: Model<V603InformationSecurityQnA>,
          v603DataProtectionQnAModel: Model<V603DataProtectionQnA>,
          tisaximportModel: Model<TisaxImport>,
          tprmVendorModel: Model<TPRMVendor>,
          tprmVendorQuestionnaireModel: Model<TPRMVendorQuestionnaire>,
          tprmVendorScheduleModel: Model<TPRMVendorSchedule>,
          tprmVendorAssessmentQnAModel: Model<TPRMVendorAssessmentQnA>,
          tprmVendorAssessmentResponseModel: Model<TPRMVendorAssessmentResponse>,
          tprmVendorRiskModel: Model<TPRMVendorRisk>,
          tprmVendorReportModel: Model<TPRMVendorReport>,
          tprmClientModel: Model<TPRMClient>,
          tprmClientScheduleModel: Model<TPRMClientSchedule>,
          tprmClientAssessmentQnAModel: Model<TPRMClientAssessmentQnA>,
          tprmClientAssessmentResponseModel: Model<TPRMClientAssessmentResponse>,

          riskAssessmentModel: Model<RiskAssessment>,
          controlModel: Model<Control>,
          assessmentUtilityModel: Model<AssessmentUtility>,
          employeeDetailsModel: Model<EmployeeDetails>,
          employeePolicyDetailsModel: Model<EmployeePolicyDetails>,
          trainingCampaignDetailsModel: Model<TrainingCampaignDetails>,
          policyTemplateModel: Model<PolicyTemplate>,
          policyVersionHistoryModel: Model<PolicyVersionHistory>,
          configureDevicesModel: Model<ConfigureDevices>,
          procedureTemplateModel: Model<ProcedureTemplate>,
          procedureModel: Model<Procedure>,
          procedureVersionHistoryModel: Model<ProcedureVersionHistory>,

        ) => {
          const AdminJS = await import('adminjs');
          const AdminJSMongoose = await import('@adminjs/mongoose');
          const AdminJSThemes = await import('@adminjs/themes');

          AdminJS.AdminJS.registerAdapter({
            Database: AdminJSMongoose.Database,
            Resource: AdminJSMongoose.Resource
          });

          return {
            adminJsOptions: {
              locale: {
                language: 'en',
                translations: {
                  en: {
                    messages: {
                      welcomeOnBoard_title: 'Welcome !',
                      "welcomeOnBoard_subtitle": "We prepared a few tips for you to start:",
                    },
                    "components": {
                      "Login": {
                        "welcomeHeader": "Welcome",
                        "welcomeMessage": "Please submit Email ID and Password",
                      }
                    },
                  },
                },
              },
              rootPath: `/${process.env.API_PREFIX}/admin`,
              logoutPath: `/${process.env.API_PREFIX}/admin/login`,
              loginPath: `/${process.env.API_PREFIX}/admin/login`,
              assets: { styles: ['/apiv1/static/custom.css'] },
              branding: {
                companyName: 'Admin Panel', logo: false, withMadeWithLove: false,
                theme: {
                  colors: {
                    primary100: '#1e5d61',
                    bg: '#000',
                  },
                },
              },
              availableThemes: [AdminJSThemes.dark, AdminJSThemes.light],
              resources: [
                {
                  resource: resourceUrlRouteModel,
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      resource_id: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      resource_name: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                    },
                  }
                },
                {
                  resource: userModel,
                  titleProperty: 'email',
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      // delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false },
                      edit: { isAccessible: false },
                    },
                  }
                },
                {
                  resource: userframeworkModel,
                  options: {
                    // listProperties: [],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    editProperties: ["frameworks", "is_deleted"],
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      frameworks: {
                        reference: FrameWork.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      email: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                    },
                  }
                },
                {
                  resource: frameworkModel,
                  options: {
                    titleProperty: 'frameworkname',
                    listProperties: ["frameworkname", "email", "controls", "in_scope_controls", "out_scope_controls", "ready_controls", "map_scf_controls"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      controls: {
                        reference: FrameControl.name,
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      in_scope_controls: {
                        reference: FrameControl.name,
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      out_scope_controls: {
                        reference: FrameControl.name,
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      ready_controls: {
                        reference: FrameControl.name,
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      map_scf_controls: {
                        reference: UserMapScfControl.name,
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      // edit: { isAccessible: false },
                    },
                  }
                },
                {
                  resource: framecontrolModel,
                  options: {
                    titleProperty: 'controlcode',
                    listProperties: ["frameworks", "email", "controlcode", "controlname", "controlcategory", "map_scf_controls", "userevidencerequestlists", "control_owners"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      frameworks: {
                        reference: FrameWork.name,
                      },
                      map_scf_controls: {
                        reference: UserMapScfControl.name,
                      },
                      "userevidencerequestlists": {
                        reference: UserEvidenceRequestList.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: dataPrivacyFrameworkModel,
                  options: {
                    titleProperty: 'frameworkname',
                    listProperties: ["frameworkname", "email", "controls", "in_scope_controls", "out_scope_controls", "ready_controls", "map_scf_controls"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      framework: {
                        reference: FrameWork.name,
                      },
                      controls: {
                        reference: FrameControl.name,
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      in_scope_controls: {
                        reference: FrameControl.name,
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      out_scope_controls: {
                        reference: FrameControl.name,
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      ready_controls: {
                        reference: FrameControl.name,
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      map_scf_controls: {
                        reference: UserMapScfControl.name,
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      // edit: { isAccessible: false },
                    },
                  }
                },
                {
                  resource: scfcontrolModel,
                  options: {
                    listProperties: ["SCF #", "SCF Domain", "SCF Control", "ERL Mappings"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: mappingerlscfcontrolModel,
                  options: {
                    listProperties: ["frameworkname", "control_scf_mapping_array"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: mappingscfcontrolModel,
                  options: {
                    listProperties: ["frameworkname", "control_scf_mapping_array"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: frameworknamecontrolcodesModel,
                  options: {
                    id: "Control Codes",
                    listProperties: ["frameworkname", "control_codes"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: evidencerequestlistModel,
                  options: {
                    listProperties: ["ERL #", "Area of Focus", "Documentation Artifact", "SCF Control Mappings"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: userMapscfcontrolModel,
                  options: {
                    titleProperty: 'SCF #',
                    listProperties: ["email", "SCF #", "SCF Control", "ERL Mappings", "userevidencerequestlists", "SCF Control Answers"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      "userevidencerequestlists": {
                        reference: UserEvidenceRequestList.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                    },
                  }
                },
                {
                  resource: userevidencerequestlistModel,
                  options: {
                    titleProperty: 'ERL #',
                    listProperties: ["email", "ERL #", "evidence_files", "evidence_urls", "policy_files", "policy_urls", "SCF Control Mappings", "map_scf_controls"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      map_scf_controls: {
                        reference: UserMapScfControl.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                    },
                  }
                },
                {
                  resource: informationSecurityQuestionModel,
                  options: {
                    listProperties: ["ISA New", "Must Requirements", "Should Requirements",
                      "Additional requirements for high protection needs",
                      "Additional requirements for very high protection needs"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: v603InformationSecurityQuestionModel,
                  options: {
                    listProperties: ["ISA New", "Must Requirements", "Should Requirements",
                      "Additional requirements for high protection needs",
                      "Additional requirements for very high protection needs",
                      "Additional requirements for Simplified Group Assessments"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: prototypeProtectionQuestionModel,
                  options: {
                    listProperties: ["ISA New", "Must Requirements", "Should Requirements",
                      "Additional requirements for vehicles classified as requiring protection"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: dataProtectionQuestionModel,
                  options: {
                    // listProperties: [],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: v603DataProtectionQuestionModel,
                  options: {
                    // listProperties: [],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: tisaxModel,
                  options: {
                    titleProperty: 'location_id',
                    // listProperties: [],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      headquarter: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                    },
                  }
                },
                {
                  resource: informationSecurityAnswerModel,
                  options: {
                    listProperties: ["tisax_cover", "user_email", "ISA New"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      "tisax_cover": {
                        reference: Tisax.name,
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: v603InformationSecurityAnswerModel,
                  options: {
                    listProperties: ["tisax_cover", "user_email", "ISA New"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      "tisax_cover": {
                        reference: Tisax.name,
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: prototypeProtectionAnswerModel,
                  options: {
                    listProperties: ["tisax_cover", "user_email", "ISA New"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      "tisax_cover": {
                        reference: Tisax.name,
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: dataProtectionAnswerModel,
                  options: {
                    listProperties: ["tisax_cover", "user_email", "ISA New"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      "tisax_cover": {
                        reference: Tisax.name,
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: v603DataProtectionAnswerModel,
                  options: {
                    listProperties: ["tisax_cover", "user_email", "ISA New"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      "tisax_cover": {
                        reference: Tisax.name,
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: tisaximportModel,
                  options: {
                    titleProperty: 'location_id',
                    // listProperties: [],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      headquarter: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                    },
                  }
                },
                {
                  resource: InformationSecurityQnAModel,
                  options: {
                    listProperties: ["tisax_cover", "user_email", "ISA New"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      "tisax_cover": {
                        reference: TisaxImport.name
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: v603InformationSecurityQnAModel,
                  options: {
                    listProperties: ["tisax_cover", "user_email", "ISA New"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      "tisax_cover": {
                        reference: TisaxImport.name
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: PrototypeProtectionQnAModel,
                  options: {
                    listProperties: ["tisax_cover", "user_email", "ISA New"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      "tisax_cover": {
                        reference: TisaxImport.name
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: DataProtectionQnAModel,
                  options: {
                    listProperties: ["tisax_cover", "user_email", "ISA New"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      "tisax_cover": {
                        reference: TisaxImport.name
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: v603DataProtectionQnAModel,
                  options: {
                    listProperties: ["tisax_cover", "user_email", "ISA New"],
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      "tisax_cover": {
                        reference: TisaxImport.name
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: tprmVendorModel,
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      // delete: { isAccessible: false },
                      // bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: tprmVendorQuestionnaireModel,
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      // delete: { isAccessible: false },
                      // bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: tprmVendorScheduleModel,
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      // delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: tprmVendorAssessmentQnAModel,
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: tprmVendorAssessmentResponseModel,
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: tprmVendorRiskModel,
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: tprmVendorReportModel,
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },

                {
                  resource: tprmClientModel,
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      // delete: { isAccessible: false },
                      // bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: tprmClientScheduleModel,
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      // delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: tprmClientAssessmentQnAModel,
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },
                {
                  resource: tprmClientAssessmentResponseModel,
                  options: {
                    sort: {
                      sortBy: 'updatedAt',
                      direction: 'desc', // Sorting direction
                    },
                    properties: {
                      user: {
                        reference: User.name,
                      },
                      _id: {
                        isVisible: {
                          filter: false,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_id: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      user_email: {
                        isVisible: {
                          filter: true,
                          list: true,
                          show: true,
                          edit: false,
                        },
                      },
                      createdAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                      updatedAt: {
                        isVisible: {
                          filter: true,
                          list: false,
                          show: true,
                          edit: false,
                        },
                      },
                    },
                    actions: {
                      new: { isAccessible: false },
                      delete: { isAccessible: false },
                      bulkDelete: { isAccessible: false }
                    },
                  }
                },

              ]
            },
            auth: {
              authenticate,
              cookieName: 'grc-adminjs',
              cookiePassword: process.env.ADMINJS_COOKIE_PASS,
            },
            sessionOptions: {
              store: new RedisStore({ client: redisClient }),
              resave: false,
              saveUninitialized: false,
              secret: process.env.ADMINJS_COOKIE_PASS,
              cookie: {
                httpOnly: true,
                secure: process.env.SECURE === 'true',
                sameSite: "lax",
                maxAge: 1000 * 3600 * 6, // Set cookie expiration(in milliseconds)
              },
              name: 'grc-adminjs',
            },
          }
        },
      })
    ),
  ],
})
export class AdminJSModule { }
