output "vcn_id" { value = oci_core_vcn.this.id }
output "subnet_ids" { value = { for k, s in oci_core_subnet.this : k => s.id } }
output "subnet_cidrs" { value = { for k, s in oci_core_subnet.this : k => s.cidr_block } }
output "nsg_ids" { value = { for k, n in oci_core_network_security_group.this : k => n.id } }
