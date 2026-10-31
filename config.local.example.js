// 复制本文件为 config.local.js 并填入真实值（config.local.js 不会进版本库）

module.exports = {
  // 销售模板里要替换掉的原联系人姓名（必须与模板原文逐字一致）
  salesContactFrom: '<销售模板原联系人姓名>',

  // 销售模板里要替换掉的原联系人电话（11位）
  salesContactPhoneFrom: '<销售模板原联系人电话>',

  // 要写入意向书的 HR 联系人手机号
  contactPhone: '<HR手机号>',

  // 社招意向书的联系人（按合同主体自动带出的那位）
  // 福州誉龙智能科技有限公司 → <姓名> / <电话>
  socialContactName: '<社招联系人姓名>',
  socialContactPhone: '<社招联系人电话>',

  // 远程实施组 Leader（汇报对象）
  socialLeader: '<远程实施组 Leader>',

  // offer 邮件的「抄送邮箱」收件人姓名（脚本按此名在联想候选里选）
  ccName: '<抄送收件人姓名>',

  // 一级部门 → Leader（组织架构页 /organization/framework）
  deptLeaders: {
    '<一级部门全名>': '<Leader姓名>',
  },
};
