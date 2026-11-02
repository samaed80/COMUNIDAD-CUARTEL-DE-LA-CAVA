update public.community_incident_notifications
set attachments = case id
  when '2253aaa3-a38e-4bc0-80f1-3331f2099c32'::uuid then jsonb_build_array(jsonb_build_object(
    'name','1000104354.jpg',
    'path','56980e58-1864-4f81-9e9f-5db8dd7b4f88/2253aaa3-a38e-4bc0-80f1-3331f2099c32/2ef676e7-0dcf-4bf1-8dc4-7626c7cc74e4-1000104354.jpg',
    'size',0,
    'type','image/jpeg'
  ))
  when '7b2d0e76-bc04-44a7-90b6-65c60b934b0d'::uuid then jsonb_build_array(jsonb_build_object(
    'name','1000104354.jpg',
    'path','56980e58-1864-4f81-9e9f-5db8dd7b4f88/7b2d0e76-bc04-44a7-90b6-65c60b934b0d/91730ded-c2c0-4319-87e1-8795a7689b94-1000104354.jpg',
    'size',0,
    'type','image/jpeg'
  ))
  when '24ea0019-3d2b-47d2-95aa-0bc588757696'::uuid then jsonb_build_array(jsonb_build_object(
    'name','1000104354.jpg',
    'path','56980e58-1864-4f81-9e9f-5db8dd7b4f88/24ea0019-3d2b-47d2-95aa-0bc588757696/a7d88c4e-f4ee-43c6-9846-1dbb8e49f964-1000104354.jpg',
    'size',0,
    'type','image/jpeg'
  ))
  else attachments
end,
updated_at = now()
where id in (
  '2253aaa3-a38e-4bc0-80f1-3331f2099c32'::uuid,
  '7b2d0e76-bc04-44a7-90b6-65c60b934b0d'::uuid,
  '24ea0019-3d2b-47d2-95aa-0bc588757696'::uuid
);
